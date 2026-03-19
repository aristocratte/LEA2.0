import { createServer } from 'node:http';

export const OAUTH_PORT = 51121;

const SUCCESS_HTML = '<h1>Authentication successful!</h1><p>You can close this window and return to LEA.</p>';
const FAILURE_HTML = '<h1>Authentication failed</h1><p>Missing code or state.</p>';

export function startCallbackServer(): Promise<{
  code: string;
  state: string;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      if (requestUrl.pathname !== '/oauth-callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const code = requestUrl.searchParams.get('code') || undefined;
      const state = requestUrl.searchParams.get('state') || undefined;

      if (code && state) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(SUCCESS_HTML);

        setTimeout(() => {
          server.close();
          clearTimeout(timeout);
          resolve({ code, state });
        }, 100);
        return;
      }

      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(FAILURE_HTML);

      setTimeout(() => {
        server.close();
        clearTimeout(timeout);
        reject(new Error('Missing code or state in OAuth callback'));
      }, 100);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout: No callback received within 5 minutes.'));
    }, 5 * 60 * 1000);

    server.listen(OAUTH_PORT, '0.0.0.0', () => {
      console.log(`[Antigravity OAuth] Callback server listening on port ${OAUTH_PORT}`);
    });
  });
}
