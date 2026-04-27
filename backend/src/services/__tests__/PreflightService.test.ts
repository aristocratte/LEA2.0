import { describe, expect, it, vi } from 'vitest';
import { PreflightService } from '../PreflightService.js';

describe('PreflightService', () => {
  it('returns a successful result and forwards callbacks', async () => {
    const service = new PreflightService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runCheck = vi.spyOn(service as any, 'runCheck');
    runCheck.mockImplementation(async (checkId: unknown) => {
      const id = checkId as string;
      if (id === 'workspace') {
        return { status: 'success', output: ['workspace ready'], metadata: { workspace: '/tmp/pentest-1' } };
      }
      if (id === 'http') {
        return { status: 'warning', output: ['reachable over HTTP only'] };
      }
      return { status: 'success', output: [`${id} ok`] };
    });

    const onCheckStarted = vi.fn();
    const onCheckCompleted = vi.fn();
    const onComplete = vi.fn();

    const result = await service.runChecks(
      { target: 'app.example.com', pentestType: 'standard', pentestId: 'pentest-1' },
      { onCheckStarted, onCheckCompleted, onComplete }
    );

    expect(result.success).toBe(true);
    expect(result.workspace).toBe('/tmp/pentest-1');
    expect(result.warnings).toHaveLength(1);
    expect(onCheckStarted).toHaveBeenCalledTimes(5);
    expect(onCheckCompleted).toHaveBeenCalledTimes(5);
    expect(onComplete).toHaveBeenCalledWith(result);
  });

  it('marks blocking failures when a required check errors', async () => {
    const service = new PreflightService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(service as any, 'runCheck')
      .mockImplementation(async (checkId: unknown) => {
        const id = checkId as string;
        if (id === 'tools') {
          return { status: 'error', output: ['nmap missing'] };
        }
        return { status: 'success', output: [`${id} ok`] };
      });

    const result = await service.runChecks({ target: 'app.example.com', pentestType: 'quick', pentestId: 'pentest-2' });

    expect(result.success).toBe(false);
    expect(result.blockingFailures.map((check) => check.id)).toContain('tools');
    expect(result.summary.failed).toBe(1);
  });

  it('converts thrown check errors into failed preflight checks', async () => {
    const service = new PreflightService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(service as any, 'runCheck')
      .mockImplementation(async (checkId: unknown) => {
        const id = checkId as string;
        if (id === 'dns') {
          throw new Error('dns timeout');
        }
        return { status: 'success', output: [`${id} ok`] };
      });

    const result = await service.runChecks({ target: 'app.example.com', pentestType: 'quick', pentestId: 'pentest-3' });
    const dnsCheck = result.checks.find((check) => check.id === 'dns');

    expect(dnsCheck?.status).toBe('error');
    expect(dnsCheck?.output).toEqual(['dns timeout']);
    expect(result.success).toBe(false);
  });
});
