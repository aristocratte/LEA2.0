/**
 * SSL Configuration for LEA Backend
 * Supports both development (self-signed) and production (valid certificates)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';

export interface SSLConfig {
  enabled: boolean;
  key?: Buffer;
  cert?: Buffer;
  ca?: Buffer;
  port: number;
  host: string;
}

/**
 * Load SSL certificates from file system
 */
export function loadSSLCertificates(): SSLConfig {
  const enabled = process.env.SSL_ENABLED === 'true';
  const port = Number(process.env.SSL_PORT) || 3443;
  const host = process.env.SSL_HOST || process.env.HOST || '0.0.0.0';

  if (!enabled) {
    return { enabled: false, port, host };
  }

  const certPath = process.env.SSL_CERT_PATH || './certs/server.crt';
  const keyPath = process.env.SSL_KEY_PATH || './certs/server.key';
  const caPath = process.env.SSL_CA_PATH;

  try {
    const cert = readFileSync(certPath);
    const key = readFileSync(keyPath);
    const ca = caPath && existsSync(caPath) ? readFileSync(caPath) : undefined;

    return {
      enabled: true,
      cert,
      key,
      ca,
      port,
      host,
    };
  } catch (error: any) {
    console.error(`[SSL] Failed to load certificates: ${error.message}`);
    console.error('[SSL] Falling back to HTTP mode');
    return { enabled: false, port, host };
  }
}

/**
 * Check if SSL is properly configured
 */
export function isSSLReady(): boolean {
  const config = loadSSLCertificates();
  return config.enabled && !!config.cert && !!config.key;
}

/**
 * Get server URL based on SSL configuration
 */
export function getServerUrl(): string {
  const config = loadSSLCertificates();
  const protocol = config.enabled ? 'https' : 'http';
  const port = config.enabled ? config.port : (process.env.PORT || 3001);
  return `${protocol}://${config.host}:${port}`;
}
