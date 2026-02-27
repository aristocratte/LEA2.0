import crypto from 'crypto';

const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

export const ANTIGRAVITY_CLIENT_ID = process.env.ANTIGRAVITY_CLIENT_ID?.trim() || "";
export const ANTIGRAVITY_CLIENT_SECRET = process.env.ANTIGRAVITY_CLIENT_SECRET?.trim() || "";
export const ANTIGRAVITY_REDIRECT_URI = process.env.ANTIGRAVITY_REDIRECT_URI?.trim() || "http://localhost:51121/oauth-callback";
export const ANTIGRAVITY_ENDPOINT = "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_ENDPOINTS = [
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
    "https://autopush-cloudcode-pa.sandbox.googleapis.com",
    "https://cloudcode-pa.googleapis.com",
];

export const ANTIGRAVITY_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
];

export interface AntigravityAuthorization {
    url: string;
    verifier: string;
    projectId: string;
}

function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}

function encodeState(payload: { verifier: string; projectId: string }): string {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeState(state: string): { verifier: string; projectId: string } {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
}

function requireOAuthConfig(): void {
    if (!ANTIGRAVITY_CLIENT_ID || !ANTIGRAVITY_CLIENT_SECRET) {
        throw new Error("ANTIGRAVITY_CLIENT_ID / ANTIGRAVITY_CLIENT_SECRET are not configured.");
    }
}

async function resolveProjectId(accessToken: string): Promise<string> {
    const body = JSON.stringify({
        metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
        },
    });

    for (const endpoint of ANTIGRAVITY_ENDPOINTS) {
        const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body,
        });

        if (!response.ok) continue;
        const payload = await response.json() as Record<string, unknown>;
        const projectId = typeof payload.cloudaicompanionProject === "string"
            ? payload.cloudaicompanionProject
            : undefined;
        if (projectId) return projectId;
    }

    return DEFAULT_PROJECT_ID;
}

export async function authorizeAntigravity(projectId = ""): Promise<AntigravityAuthorization> {
    requireOAuthConfig();
    const pkce = generatePKCE();

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
    url.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", encodeState({ verifier: pkce.verifier, projectId }));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    return {
        url: url.toString(),
        verifier: pkce.verifier,
        projectId: projectId || "",
    };
}

export interface AntigravityTokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
}

export interface AntigravityTokenExchangeResult {
    type: "success" | "failed";
    refresh?: string;
    access?: string;
    expires?: number;
    email?: string;
    projectId?: string;
    error?: string;
}

export async function exchangeAntigravity(
    code: string,
    state: string
): Promise<AntigravityTokenExchangeResult> {
    try {
        requireOAuthConfig();
        const { verifier, projectId } = decodeState(state);

        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: new URLSearchParams({
                client_id: ANTIGRAVITY_CLIENT_ID,
                client_secret: ANTIGRAVITY_CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: ANTIGRAVITY_REDIRECT_URI,
                code_verifier: verifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            return { type: "failed", error: errorText };
        }

        const tokenPayload = (await tokenResponse.json()) as AntigravityTokenResponse;

        const userInfoResponse = await fetch(
            "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
            {
                headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
            }
        );

        const userInfo: any = userInfoResponse.ok ? await userInfoResponse.json() : {};
        const effectiveProjectId = projectId || await resolveProjectId(tokenPayload.access_token);

        return {
            type: "success",
            refresh: tokenPayload.refresh_token,
            access: tokenPayload.access_token,
            expires: Date.now() + tokenPayload.expires_in * 1000,
            email: userInfo.email,
            projectId: effectiveProjectId || DEFAULT_PROJECT_ID,
        };
    } catch (error) {
        return {
            type: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
}> {
    requireOAuthConfig();

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
            client_id: ANTIGRAVITY_CLIENT_ID,
            client_secret: ANTIGRAVITY_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to refresh token: " + await response.text());
    }

    return response.json();
}
