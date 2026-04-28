import { afterEach, describe, expect, it, vi } from 'vitest';
import { KaliMCPClient } from '../KaliMCPClient.js';

const ORIGINAL_DEBUG = process.env.MCP_DEBUG_COMPAT_LOCAL;

afterEach(() => {
  process.env.MCP_DEBUG_COMPAT_LOCAL = ORIGINAL_DEBUG;
  vi.restoreAllMocks();
});

describe('KaliMCPClient', () => {
  it('marks the client healthy in jsonrpc mode after a successful ping', async () => {
    const client = new KaliMCPClient('http://localhost:3002/mcp', 5000);
    vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
      .mockResolvedValue({ status: 'ok' });

    await expect(client.healthCheck()).resolves.toBe(true);
    expect(client.isConnected()).toBe(true);
    expect(client.getMode()).toBe('jsonrpc');
  });

  it('falls back to compat-local mode when debug compat is enabled', async () => {
    process.env.MCP_DEBUG_COMPAT_LOCAL = 'true';
    const client = new KaliMCPClient('http://localhost:3002/mcp', 5000);
    vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
      .mockRejectedValue(new Error('offline'));

    await expect(client.healthCheck()).resolves.toBe(true);
    expect(client.getMode()).toBe('compat-local');
  });

  it('blocks curl flags that contain shell pipes or redirections', async () => {
    const client = new KaliMCPClient();

    const result = await client.callTool('curl_request', {
      url: 'https://app.example.com',
      flags: '-s | grep title',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('http_request');
    expect(result.meta).toMatchObject({
      blockedByPolicy: true,
      recommendedTool: 'http_request',
    });
  });

  it('blocks tools that violate scope before sending a request', async () => {
    const client = new KaliMCPClient();
    const sendRequest = vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
      .mockResolvedValue({});

    const result = await client.callTool(
      'nmap_scan',
      { target: 'outside.example.com' },
      120000,
      { inScope: ['app.example.com'], scopeMode: 'extended' }
    );

    expect(result.success).toBe(false);
    expect(result.meta).toMatchObject({ blockedByScope: true });
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('does not implicitly allow context.target when explicit in-scope excludes it', async () => {
    const client = new KaliMCPClient();
    const sendRequest = vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
      .mockResolvedValue({});

    const result = await client.callTool(
      'nmap_scan',
      { target: 'outside.example.com' },
      120000,
      { target: 'outside.example.com', inScope: ['app.example.com'], scopeMode: 'extended' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside runtime scope');
    expect(result.meta).toMatchObject({ blockedByScope: true });
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('returns parsed tool output for a successful JSON-RPC tool call', async () => {
    const client = new KaliMCPClient();
    vi.spyOn(client as unknown as { sendRequest: (...args: unknown[]) => Promise<unknown> }, 'sendRequest')
      .mockResolvedValue({
        content: [{ type: 'text', text: 'scan completed' }],
        isError: false,
        meta: { exit_code: 0 },
      });

    const result = await client.callTool('dig_lookup', { target: 'app.example.com' });

    expect(result.success).toBe(true);
    expect(result.output).toBe('scan completed');
    expect(result.meta).toEqual({ exit_code: 0 });
  });
});
