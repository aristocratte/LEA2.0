import { z } from 'zod';

export type PluginTrustState = 'untrusted' | 'trusted' | 'denied';
export type PluginRuntimeState = PluginTrustState | 'loaded' | 'error';

export const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  skills: z.array(z.string().min(1)).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface PluginSnapshot {
  id: string;
  name: string;
  version: string;
  description: string;
  directory: string;
  digest: string;
  trust: PluginTrustState;
  state: PluginRuntimeState;
  skills: string[];
  registeredTools: string[];
  errors: string[];
}

export interface PluginManagerSnapshot {
  pluginsDir: string;
  trustStorePath: string;
  loadedAt?: string;
  plugins: PluginSnapshot[];
  errors: string[];
}
