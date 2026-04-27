import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { LspAnalysisService } from '../LspAnalysisService.js';
import { parseLspQueryBody } from '../../../routes/lsp.js';

describe('LspAnalysisService', () => {
  it('returns symbols and diagnostics for TypeScript files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lea-lsp-'));
    await writeFile(join(root, 'sample.ts'), `
      export interface Target { host: string }
      export function scan(target: Target): string { return target.missing; }
      const localValue = 42;
    `, 'utf8');

    const service = new LspAnalysisService(root);
    const symbols = await service.symbols({ paths: ['sample.ts'] });
    const diagnostics = await service.diagnostics({ paths: ['sample.ts'] });

    expect(symbols.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(['Target', 'scan', 'localValue']),
    );
    expect(diagnostics.diagnostics.some((diagnostic) => diagnostic.message.includes('missing'))).toBe(true);
  }, 15_000);

  it('rejects paths outside the configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lea-lsp-'));
    const service = new LspAnalysisService(root);

    await expect(service.symbols({ paths: ['../outside.ts'] })).rejects.toThrow('outside');
  });

  it('rejects invalid route query limits before analysis', () => {
    expect(() => parseLspQueryBody({ limit: Number.NaN })).toThrow();
    expect(() => parseLspQueryBody({ limit: 0 })).toThrow();
    expect(() => parseLspQueryBody({ limit: 201 })).toThrow();
    expect(parseLspQueryBody({ limit: 10 })).toEqual({ limit: 10 });
  });
});
