import { describe, expect, it } from 'vitest';
import { evaluateToolScope, normalizeScopeTarget } from '../ScopeGuard.js';

describe('ScopeGuard', () => {
  it('normalizes URL targets to canonical hosts', () => {
    expect(normalizeScopeTarget('https://App.Example.com:443/path')).toMatchObject({
      kind: 'domain',
      host: 'app.example.com',
      canonical: 'app.example.com',
    });
  });

  it('blocks explicit out-of-scope domains before allow-list checks', () => {
    const result = evaluateToolScope({
      toolName: 'http_request',
      toolSource: 'mcp',
      input: { url: 'https://admin.example.com' },
      context: {
        inScope: ['*.example.com'],
        outOfScope: ['admin.example.com'],
        scopeMode: 'extended',
      },
    });

    expect(result).toMatchObject({
      allowed: false,
      code: 'out_of_scope',
    });
  });

  it('blocks private IPs unless explicitly allowed and in scope', () => {
    expect(
      evaluateToolScope({
        toolName: 'nmap_scan',
        toolSource: 'mcp',
        input: { target: '10.0.0.5' },
        context: { inScope: ['10.0.0.5'], scopeMode: 'extended' },
      }),
    ).toMatchObject({
      allowed: false,
      code: 'private_ip_blocked',
    });

    expect(
      evaluateToolScope({
        toolName: 'nmap_scan',
        toolSource: 'mcp',
        input: { target: '10.0.0.5' },
        context: { inScope: ['10.0.0.5'], scopeMode: 'extended', allowPrivateTargets: true },
      }),
    ).toMatchObject({ allowed: true });
  });

  it('blocks localhost even when it is listed in scope', () => {
    const result = evaluateToolScope({
      toolName: 'nmap_scan',
      toolSource: 'mcp',
      input: { target: '127.0.0.1' },
      context: { inScope: ['127.0.0.1'], scopeMode: 'extended', allowPrivateTargets: true },
    });

    expect(result).toMatchObject({
      allowed: false,
      code: 'localhost_blocked',
    });
  });
});
