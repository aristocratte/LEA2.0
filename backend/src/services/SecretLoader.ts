import fs from 'fs';

/**
 * Charge un secret depuis un fichier Docker ou une variable d'environnement.
 * Ordre de priorité : fichier > env var > undefined
 */
export function loadSecret(secretName: string, envVarName?: string): string | undefined {
  // 1. Essayer de lire depuis un fichier (Docker secrets)
  const secretFile = process.env[`${secretName}_FILE`];
  if (secretFile) {
    try {
      return fs.readFileSync(secretFile, 'utf-8').trim();
    } catch (err) {
      console.warn(`[SecretLoader] Failed to read secret file: ${secretFile}`);
    }
  }

  // 2. Fallback sur la variable d'environnement
  const envVar = envVarName || secretName;
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }

  return undefined;
}

export const getAnthropicKey = () => loadSecret('ANTHROPIC_API_KEY');
export const getOpenAIKey = () => loadSecret('OPENAI_API_KEY');
export const getOpenCodeKey = () => loadSecret('OPENCODE_API_KEY');
