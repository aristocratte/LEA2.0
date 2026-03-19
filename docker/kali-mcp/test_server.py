import importlib.util
import json
import sys
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen


MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("lea_kali_mcp_server", MODULE_PATH)
server = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


def test_run_tool_workspace_init_and_write_file(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        monkeypatch.setattr(server, "WORKSPACE_ROOT", root)
        monkeypatch.setattr(server, "PENTESTS_ROOT", root / "pentests")
        monkeypatch.setattr(server, "SHARED_ROOT", root / "shared")
        monkeypatch.setattr(server, "LOGS_ROOT", root / "logs")
        monkeypatch.setattr(server, "AUDIT_FILE", root / "logs" / "audit.log")
        server.ensure_dirs()
        workspace = (server.PENTESTS_ROOT / "pentest-1").resolve()
        workspace.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(server, "resolve_workspace", lambda _pentest_id: workspace)

        result = server.run_tool("workspace_init", {"pentest_id": "pentest-1"}, {})
        assert result["isError"] is False

        write_result = server.run_tool(
            "workspace_write_file",
            {"pentest_id": "pentest-1", "path": "notes/findings.txt", "content": "hello"},
            {},
        )
        assert write_result["isError"] is False

        read_result = server.run_tool(
            "workspace_read_file",
            {"pentest_id": "pentest-1", "path": "notes/findings.txt"},
            {},
        )
        assert read_result["content"][0]["text"] == "hello"


def test_run_tool_rejects_workspace_escape(monkeypatch):
    with tempfile.TemporaryDirectory() as tmpdir:
        root = Path(tmpdir)
        monkeypatch.setattr(server, "WORKSPACE_ROOT", root)
        monkeypatch.setattr(server, "PENTESTS_ROOT", root / "pentests")
        monkeypatch.setattr(server, "SHARED_ROOT", root / "shared")
        monkeypatch.setattr(server, "LOGS_ROOT", root / "logs")
        monkeypatch.setattr(server, "AUDIT_FILE", root / "logs" / "audit.log")
        server.ensure_dirs()
        workspace = (server.PENTESTS_ROOT / "pentest-1").resolve()
        workspace.mkdir(parents=True, exist_ok=True)
        monkeypatch.setattr(server, "resolve_workspace", lambda _pentest_id: workspace)

        try:
            server.run_tool("workspace_read_file", {"pentest_id": "pentest-1", "path": "../secret.txt"}, {})
        except ValueError as exc:
            assert "escapes workspace" in str(exc)
        else:
            raise AssertionError("Expected workspace escape to be rejected")


def test_health_and_jsonrpc_error_response(monkeypatch):
    sent = {}

    handler = server.Handler.__new__(server.Handler)
    handler.path = "/health"
    handler._send_json = lambda status, payload: sent.update({"status": status, "payload": payload})

    handler.do_GET()
    assert sent["status"] == 200
    assert sent["payload"]["status"] == "ok"

    error_sent = {}
    post_handler = server.Handler.__new__(server.Handler)
    post_handler.path = "/mcp"
    post_handler._read_json = lambda: {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": ""},
    }
    post_handler._send_json = lambda status, payload: error_sent.update({"status": status, "payload": payload})

    post_handler.do_POST()
    assert error_sent["status"] == 200
    assert error_sent["payload"]["error"]["message"] == "tools/call missing name"
