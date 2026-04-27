import { describe, it, expect } from 'vitest';
import { interpretExitCode, getCommandStatus, getSupportedCommands } from '../exitCodeSemantics.js';

describe('exitCodeSemantics', () => {
  // grep
  it('grep code 0 = success', () => {
    const r = interpretExitCode('grep', 0);
    expect(r.isError).toBe(false);
  });
  it('grep code 1 = no matches, not error', () => {
    const r = interpretExitCode('grep', 1);
    expect(r.isError).toBe(false);
    expect(r.message).toBe('No matches found');
    expect(r.isSemanticSuccess).toBe(true);
  });
  it('grep code 2 = error', () => {
    const r = interpretExitCode('grep', 2);
    expect(r.isError).toBe(true);
  });

  // diff
  it('diff code 1 = files differ, not error', () => {
    const r = interpretExitCode('diff', 1);
    expect(r.isError).toBe(false);
    expect(r.message).toBe('Files differ');
  });

  // find
  it('find code 1 = partial success', () => {
    const r = interpretExitCode('find', 1);
    expect(r.isError).toBe(false);
  });

  // Unknown command → default
  it('unknown command code 1 = error', () => {
    const r = interpretExitCode('unknown_cmd', 1);
    expect(r.isError).toBe(true);
  });
  it('unknown command code 0 = success', () => {
    const r = interpretExitCode('unknown_cmd', 0);
    expect(r.isError).toBe(false);
  });

  // getCommandStatus
  it('grep code 1 → completed_with_warning', () => {
    expect(getCommandStatus('grep', 1)).toBe('completed_with_warning');
  });
  it('grep code 0 → completed', () => {
    expect(getCommandStatus('grep', 0)).toBe('completed');
  });
  it('grep code 2 → failed', () => {
    expect(getCommandStatus('grep', 2)).toBe('failed');
  });
  it('ls code 1 → failed', () => {
    expect(getCommandStatus('ls', 1)).toBe('failed');
  });

  // getSupportedCommands
  it('includes grep, rg, diff, find', () => {
    const cmds = getSupportedCommands();
    expect(cmds).toContain('grep');
    expect(cmds).toContain('rg');
    expect(cmds).toContain('diff');
    expect(cmds).toContain('find');
  });
});
