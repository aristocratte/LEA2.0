const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

export function parseCsvEnv(value: string | undefined, fallback: string[]): string[] {
  const parsed = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed && parsed.length > 0 ? parsed : fallback;
}

export function getAllowedCorsOrigins(): string[] {
  return parseCsvEnv(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
}

export function resolveAllowedCorsOrigin(origin: string | undefined): string | null {
  if (!origin) {
    return null;
  }

  if (process.env.LEA_ALLOW_DEV_CORS === 'true' || getAllowedCorsOrigins().includes(origin)) {
    return origin;
  }

  return null;
}

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  return !origin || resolveAllowedCorsOrigin(origin) !== null;
}
