import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PluginTrustState } from './types.js';

interface StoredTrustRecord {
  digest: string;
  state: Exclude<PluginTrustState, 'untrusted'>;
  updatedAt: string;
}

type TrustFile = Record<string, StoredTrustRecord>;

export class PluginTrustStore {
  private loaded = false;
  private records: TrustFile = {};

  constructor(readonly filePath: string) {}

  async getState(pluginId: string, digest: string): Promise<PluginTrustState> {
    await this.load();
    const record = this.records[pluginId];
    if (!record || record.digest !== digest) return 'untrusted';
    return record.state;
  }

  async trust(pluginId: string, digest: string): Promise<void> {
    await this.set(pluginId, digest, 'trusted');
  }

  async deny(pluginId: string, digest: string): Promise<void> {
    await this.set(pluginId, digest, 'denied');
  }

  private async set(pluginId: string, digest: string, state: Exclude<PluginTrustState, 'untrusted'>): Promise<void> {
    await this.load();
    this.records[pluginId] = {
      digest,
      state,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      this.records = JSON.parse(await readFile(this.filePath, 'utf8')) as TrustFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      this.records = {};
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.records, null, 2)}\n`, 'utf8');
  }
}
