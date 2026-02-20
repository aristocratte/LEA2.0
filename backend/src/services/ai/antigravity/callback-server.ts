import express from "express";
import type { Server } from "http";

export const OAUTH_PORT = 51121;

export function startCallbackServer(): Promise<{
    code: string;
    state: string;
}> {
    return new Promise((resolve, reject) => {
        const app = express();
        let server: Server;

        // Timeout after 5 minutes
        const timeout = setTimeout(() => {
            if (server) server.close();
            reject(new Error("OAuth timeout: No callback received within 5 minutes."));
        }, 5 * 60 * 1000);

        app.get("/oauth-callback", (req, res) => {
            const code = req.query.code as string | undefined;
            const state = req.query.state as string | undefined;

            if (code && state) {
                res.send("<h1>Authentication successful!</h1><p>You can close this window and return to LEA.</p>");

                // Give time for response to be sent before closing
                setTimeout(() => {
                    server.close();
                    clearTimeout(timeout);
                    resolve({ code, state });
                }, 100);
            } else {
                res.status(400).send("<h1>Authentication failed</h1><p>Missing code or state.</p>");
                setTimeout(() => {
                    server.close();
                    clearTimeout(timeout);
                    reject(new Error("Missing code or state in OAuth callback"));
                }, 100);
            }
        });

        server = app.listen(OAUTH_PORT, "0.0.0.0", () => {
            console.log(`[Antigravity OAuth] Callback server listening on port ${OAUTH_PORT}`);
        });
    });
}
