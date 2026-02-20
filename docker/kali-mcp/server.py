#!/usr/bin/env python3
"""
LEA Kali MCP JSON-RPC server.

Implements a strict, auditable tool interface over HTTP:
- POST /mcp (JSON-RPC 2.0)
- GET /health
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import urlparse

HOST = os.getenv("MCP_HOST", "0.0.0.0")
PORT = int(os.getenv("MCP_PORT", "3002"))
WORKSPACE_ROOT = Path(os.getenv("WORKSPACE_ROOT", "/workspace"))
PENTESTS_ROOT = WORKSPACE_ROOT / "pentests"
SHARED_ROOT = WORKSPACE_ROOT / "shared"
LOGS_ROOT = WORKSPACE_ROOT / "logs"
AUDIT_FILE = LOGS_ROOT / "audit.log"

MAX_OUTPUT = 200_000
ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
CTRL_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


@dataclass
class ToolResult:
    success: bool
    output: str = ""
    error: str = ""
    exit_code: int = 0
    duration_ms: int = 0


TOOL_DEFS = [
    {
        "name": "nmap_scan",
        "description": "Run Nmap scan against target host",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target": {"type": "string"},
                "ports": {"type": "string"},
                "flags": {"type": "string"},
            },
            "required": ["target"],
        },
    },
    {
        "name": "dig_lookup",
        "description": "Run DNS lookup using dig",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target": {"type": "string"},
                "record_type": {"type": "string"},
            },
            "required": ["target"],
        },
    },
    {
        "name": "whois_lookup",
        "description": "Run whois lookup for a domain",
        "inputSchema": {
            "type": "object",
            "properties": {"target": {"type": "string"}},
            "required": ["target"],
        },
    },
    {
        "name": "curl_request",
        "description": "Run curl request",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "flags": {"type": "string"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "whatweb_scan",
        "description": "Fingerprint web technologies",
        "inputSchema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "name": "waf_detect",
        "description": "Detect WAF with wafw00f",
        "inputSchema": {
            "type": "object",
            "properties": {"target": {"type": "string"}},
            "required": ["target"],
        },
    },
    {
        "name": "shell_exec",
        "description": "Execute shell command in Kali workspace as root",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "cwd": {"type": "string"},
                "timeout": {"type": "number"},
                "pentest_id": {"type": "string"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "ensure_tool",
        "description": "Install a missing tool dynamically",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tool": {"type": "string"},
                "package": {"type": "string"},
                "manager": {"type": "string", "enum": ["auto", "apt", "pip", "go"]},
            },
            "required": ["tool"],
        },
    },
    {
        "name": "workspace_init",
        "description": "Initialize pentest workspace directory",
        "inputSchema": {
            "type": "object",
            "properties": {"pentest_id": {"type": "string"}},
            "required": ["pentest_id"],
        },
    },
    {
        "name": "workspace_list",
        "description": "List files in pentest workspace",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pentest_id": {"type": "string"},
                "path": {"type": "string"},
            },
            "required": ["pentest_id"],
        },
    },
    {
        "name": "workspace_tree",
        "description": "Return workspace tree for UI exploration",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pentest_id": {"type": "string"},
                "depth": {"type": "number"},
            },
            "required": ["pentest_id"],
        },
    },
    {
        "name": "workspace_write_file",
        "description": "Write text content to a file under pentest workspace",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pentest_id": {"type": "string"},
                "path": {"type": "string"},
                "content": {"type": "string"},
                "append": {"type": "boolean"},
            },
            "required": ["pentest_id", "path", "content"],
        },
    },
    {
        "name": "workspace_read_file",
        "description": "Read text content from a file under pentest workspace",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pentest_id": {"type": "string"},
                "path": {"type": "string"},
                "max_bytes": {"type": "number"},
            },
            "required": ["pentest_id", "path"],
        },
    },
    {
        "name": "workspace_search",
        "description": "Search text recursively in pentest workspace",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pentest_id": {"type": "string"},
                "query": {"type": "string"},
                "path": {"type": "string"},
                "max_results": {"type": "number"},
            },
            "required": ["pentest_id", "query"],
        },
    },
    {
        "name": "dig",
        "description": "Alias of dig_lookup",
        "inputSchema": {"type": "object", "properties": {"target": {"type": "string"}}},
    },
    {
        "name": "whois",
        "description": "Alias of whois_lookup",
        "inputSchema": {"type": "object", "properties": {"target": {"type": "string"}}},
    },
    {
        "name": "curl",
        "description": "Alias of curl_request",
        "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}},
    },
    {
        "name": "whatweb",
        "description": "Alias of whatweb_scan",
        "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}},
    },
]


TOOL_MAP = {tool["name"]: tool for tool in TOOL_DEFS}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_text(value: str) -> str:
    if not value:
        return ""
    cleaned = ANSI_RE.sub("", value)
    cleaned = CTRL_RE.sub("", cleaned)
    return cleaned[:MAX_OUTPUT]


def shell_join(parts: List[str]) -> str:
    return " ".join(shlex.quote(p) for p in parts)


def resolve_workspace(pentest_id: str) -> Path:
    safe_id = re.sub(r"[^a-zA-Z0-9._-]", "_", pentest_id)
    path = PENTESTS_ROOT / safe_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_audit(payload: Dict[str, Any]) -> None:
    LOGS_ROOT.mkdir(parents=True, exist_ok=True)
    with AUDIT_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=True) + "\n")


def run_command(cmd: List[str], timeout: int = 60, cwd: str | None = None) -> ToolResult:
    start = time.time()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd,
            check=False,
        )
        duration = int((time.time() - start) * 1000)
        output = (proc.stdout or "").strip()
        error = (proc.stderr or "").strip()
        success = proc.returncode == 0
        merged = "\n".join([s for s in [output, error] if s]).strip()
        return ToolResult(
            success=success,
            output=normalize_text(merged),
            error="" if success else normalize_text(merged or f"Command failed ({proc.returncode})"),
            exit_code=proc.returncode,
            duration_ms=duration,
        )
    except subprocess.TimeoutExpired:
        duration = int((time.time() - start) * 1000)
        return ToolResult(
            success=False,
            error=f"Command timeout after {timeout}s",
            exit_code=124,
            duration_ms=duration,
        )


def parse_tool_name(name: str) -> str:
    aliases = {
        "dig": "dig_lookup",
        "whois": "whois_lookup",
        "curl": "curl_request",
        "whatweb": "whatweb_scan",
    }
    return aliases.get(name, name)


def detect_manager(manager: str, package: str) -> str:
    if manager and manager != "auto":
        return manager
    if package.startswith("go:"):
        return "go"
    if package.startswith("pip:"):
        return "pip"
    return "apt"


def run_tool(name: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    tool_name = parse_tool_name(name)
    actor = str(context.get("actor") or "system")
    pentest_id = str(args.get("pentest_id") or context.get("pentest_id") or "global")
    workspace = resolve_workspace(pentest_id)

    command = ""
    result: ToolResult

    if tool_name == "workspace_init":
        (workspace / "artifacts").mkdir(parents=True, exist_ok=True)
        (workspace / "notes").mkdir(parents=True, exist_ok=True)
        (workspace / "scans").mkdir(parents=True, exist_ok=True)
        (workspace / "logs").mkdir(parents=True, exist_ok=True)
        result = ToolResult(success=True, output=str(workspace), duration_ms=1)
    elif tool_name == "workspace_list":
        rel_path = str(args.get("path") or ".")
        target = (workspace / rel_path).resolve()
        if not str(target).startswith(str(workspace)):
            raise ValueError("workspace_list path escapes workspace")
        command = shell_join(["ls", "-la", str(target)])
        result = run_command(["ls", "-la", str(target)], timeout=30)
    elif tool_name == "workspace_tree":
        depth = int(args.get("depth") or 3)
        command = shell_join(["tree", "-a", "-L", str(max(1, min(depth, 6))), str(workspace)])
        result = run_command(["tree", "-a", "-L", str(max(1, min(depth, 6))), str(workspace)], timeout=30)
    elif tool_name == "workspace_write_file":
        rel_path = str(args.get("path") or "").strip()
        if not rel_path:
            raise ValueError("workspace_write_file requires path")
        target = (workspace / rel_path).resolve()
        if not str(target).startswith(str(workspace)):
            raise ValueError("workspace_write_file path escapes workspace")
        target.parent.mkdir(parents=True, exist_ok=True)
        content = str(args.get("content") or "")
        append = bool(args.get("append") or False)
        mode = "a" if append else "w"
        with target.open(mode, encoding="utf-8") as f:
            f.write(content)
        result = ToolResult(success=True, output=str(target), duration_ms=1)
    elif tool_name == "workspace_read_file":
        rel_path = str(args.get("path") or "").strip()
        if not rel_path:
            raise ValueError("workspace_read_file requires path")
        target = (workspace / rel_path).resolve()
        if not str(target).startswith(str(workspace)):
            raise ValueError("workspace_read_file path escapes workspace")
        if not target.exists() or not target.is_file():
            raise ValueError(f"File not found: {rel_path}")
        max_bytes = int(args.get("max_bytes") or 50000)
        max_bytes = max(1024, min(max_bytes, 200000))
        content = target.read_text(encoding="utf-8", errors="replace")
        result = ToolResult(success=True, output=normalize_text(content[:max_bytes]), duration_ms=1)
    elif tool_name == "workspace_search":
        query = str(args.get("query") or "").strip()
        if not query:
            raise ValueError("workspace_search requires query")
        rel_path = str(args.get("path") or ".").strip()
        target = (workspace / rel_path).resolve()
        if not str(target).startswith(str(workspace)):
            raise ValueError("workspace_search path escapes workspace")
        max_results = int(args.get("max_results") or 20)
        max_results = max(1, min(max_results, 200))
        grep_cmd = (
            f"grep -RIn --binary-files=without-match --line-number "
            f"-- {shlex.quote(query)} {shlex.quote(str(target))} | head -n {max_results}"
        )
        command = grep_cmd
        result = run_command(["sh", "-lc", grep_cmd], timeout=45, cwd=str(workspace))
    elif tool_name == "nmap_scan":
        target = str(args.get("target") or "").strip()
        if not target:
            raise ValueError("nmap_scan requires target")
        ports = str(args.get("ports") or "")
        flags = shlex.split(str(args.get("flags") or "-sV -T4"))
        cmd = ["nmap", *flags]
        if ports:
            cmd.extend(["-p", ports])
        cmd.append(target)
        command = shell_join(cmd)
        result = run_command(cmd, timeout=int(args.get("timeout") or 120), cwd=str(workspace))
    elif tool_name == "dig_lookup":
        target = str(args.get("target") or args.get("domain") or "").strip()
        record_type = str(args.get("record_type") or "A").strip()
        if not target:
            raise ValueError("dig_lookup requires target")
        cmd = ["dig", target, record_type, "+short"]
        command = shell_join(cmd)
        result = run_command(cmd, timeout=30, cwd=str(workspace))
    elif tool_name == "whois_lookup":
        target = str(args.get("target") or args.get("domain") or "").strip()
        if not target:
            raise ValueError("whois_lookup requires target")
        cmd = ["whois", target]
        command = shell_join(cmd)
        result = run_command(cmd, timeout=45, cwd=str(workspace))
    elif tool_name == "curl_request":
        url = str(args.get("url") or "").strip()
        if not url:
            raise ValueError("curl_request requires url")
        flags = shlex.split(str(args.get("flags") or "-I -s --connect-timeout 10"))
        cmd = ["curl", *flags, url]
        command = shell_join(cmd)
        result = run_command(cmd, timeout=45, cwd=str(workspace))
    elif tool_name == "whatweb_scan":
        url = str(args.get("url") or "").strip()
        if not url:
            raise ValueError("whatweb_scan requires url")
        cmd = ["whatweb", url]
        command = shell_join(cmd)
        result = run_command(cmd, timeout=60, cwd=str(workspace))
    elif tool_name == "waf_detect":
        target = str(args.get("target") or args.get("url") or "").strip()
        if not target:
            raise ValueError("waf_detect requires target")
        cmd = ["wafw00f", target]
        command = shell_join(cmd)
        result = run_command(cmd, timeout=60, cwd=str(workspace))
    elif tool_name == "shell_exec":
        cmd_text = str(args.get("command") or "").strip()
        if not cmd_text:
            raise ValueError("shell_exec requires command")
        cwd = str(args.get("cwd") or workspace)
        resolved_cwd = Path(cwd).resolve()
        if not str(resolved_cwd).startswith(str(workspace)) and not str(resolved_cwd).startswith(str(SHARED_ROOT)):
            raise ValueError("shell_exec cwd must stay within workspace/shared")
        timeout = int(args.get("timeout") or 120)
        command = cmd_text
        result = run_command(["sh", "-lc", cmd_text], timeout=timeout, cwd=str(resolved_cwd))
    elif tool_name == "ensure_tool":
        tool = str(args.get("tool") or "").strip()
        package = str(args.get("package") or tool).strip()
        manager = detect_manager(str(args.get("manager") or "auto"), package)
        if not tool:
            raise ValueError("ensure_tool requires tool")

        if manager == "apt":
            pkg = package.replace("apt:", "")
            command = f"apt-get update && apt-get install -y {shlex.quote(pkg)}"
            result = run_command(["sh", "-lc", command], timeout=600)
        elif manager == "pip":
            pkg = package.replace("pip:", "")
            command = f"python3 -m pip install --break-system-packages {shlex.quote(pkg)}"
            result = run_command(["sh", "-lc", command], timeout=600)
        elif manager == "go":
            pkg = package.replace("go:", "")
            command = f"go install {shlex.quote(pkg)}"
            result = run_command(["sh", "-lc", command], timeout=600, cwd=str(workspace))
        else:
            raise ValueError(f"Unsupported manager: {manager}")

        if result.success:
            verify = run_command(["sh", "-lc", f"command -v {shlex.quote(tool)}"], timeout=30)
            if not verify.success:
                result = ToolResult(
                    success=False,
                    error=f"Install command succeeded but tool '{tool}' is not in PATH",
                    exit_code=1,
                    duration_ms=result.duration_ms,
                )
    else:
        raise ValueError(f"Unsupported tool: {tool_name}")

    payload = {
        "timestamp": now_iso(),
        "pentest_id": pentest_id,
        "actor": actor,
        "tool": tool_name,
        "command": command,
        "arguments": args,
        "cwd": str(workspace),
        "success": result.success,
        "exit_code": result.exit_code,
        "duration_ms": result.duration_ms,
        "output": normalize_text(result.output),
        "error": normalize_text(result.error),
    }
    write_audit(payload)

    content = result.output if result.success else result.error
    return {
        "content": [{"type": "text", "text": content or "[no output]"}],
        "isError": not result.success,
        "meta": {
            "exit_code": result.exit_code,
            "duration_ms": result.duration_ms,
            "workspace": str(workspace),
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LEAKaliMCP/1.0"

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        if self.path == "/health":
            payload = {
                "status": "ok",
                "timestamp": now_iso(),
                "tools": {
                    "nmap": shutil_which("nmap"),
                    "dig": shutil_which("dig"),
                    "whois": shutil_which("whois"),
                    "curl": shutil_which("curl"),
                },
            }
            self._send_json(200, payload)
            return
        self._send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/mcp":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            request = self._read_json()
            method = request.get("method")
            req_id = request.get("id")
            params = request.get("params") or {}

            if method == "ping":
                result = {
                    "status": "ok",
                    "timestamp": now_iso(),
                    "server": "lea-kali-mcp",
                }
            elif method == "tools/list":
                result = {"tools": TOOL_DEFS}
            elif method == "tools/call":
                name = str(params.get("name") or "")
                arguments = params.get("arguments") or {}
                if not name:
                    raise ValueError("tools/call missing name")
                context = arguments.pop("__context", {}) if isinstance(arguments, dict) else {}
                result = run_tool(name, arguments, context if isinstance(context, dict) else {})
            else:
                raise ValueError(f"Unsupported method: {method}")

            self._send_json(
                200,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result,
                },
            )
        except Exception as exc:  # pylint: disable=broad-except
            self._send_json(
                200,
                {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32000,
                        "message": str(exc),
                    },
                },
            )


def shutil_which(cmd: str) -> bool:
    return subprocess.run(["sh", "-lc", f"command -v {shlex.quote(cmd)} >/dev/null 2>&1"]).returncode == 0


def ensure_dirs() -> None:
    PENTESTS_ROOT.mkdir(parents=True, exist_ok=True)
    SHARED_ROOT.mkdir(parents=True, exist_ok=True)
    LOGS_ROOT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    ensure_dirs()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[lea-kali-mcp] listening on {HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
