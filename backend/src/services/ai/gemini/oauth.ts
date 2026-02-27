import crypto from 'crypto';

export const GEMINI_OAUTH_CLIENT_ID =
  process.env.GEMINI_OAUTH_CLIENT_ID?.trim() ||
  process.env.GEMINI_CLI_OAUTH_CLIENT_ID?.trim() ||
  '';

export const GEMINI_OAUTH_CLIENT_SECRET =
  process.env.GEMINI_OAUTH_CLIENT_SECRET?.trim() ||
  process.env.GEMINI_CLI_OAUTH_CLIENT_SECRET?.trim() ||
  '';

export const GEMINI_OAUTH_REDIRECT_URI =
  process.env.GEMINI_OAUTH_REDIRECT_URI?.trim() || 'http://localhost:51121/oauth-callback';

export const GEMINI_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const GEMINI_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json';

export interface GeminiAuthorization {
  url: string;
  verifier: string;
}

export interface GeminiTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface GeminiTokenExchangeResult {
  type: 'success' | 'failed';
  refresh?: string;
  access?: string;
  expires?: number;
  email?: string;
  error?: string;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function requireOAuthConfig(): void {
  if (!GEMINI_OAUTH_CLIENT_ID || !GEMINI_OAUTH_CLIENT_SECRET) {
    throw new Error('GEMINI_OAUTH_CLIENT_ID / GEMINI_OAUTH_CLIENT_SECRET are not configured.');
  }
}

export async function authorizeGemini(): Promise<GeminiAuthorization> {
  requireOAuthConfig();

  const pkce = generatePKCE();

  const url = new URL(GEMINI_AUTH_URL);
  url.searchParams.set('client_id', GEMINI_OAUTH_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', GEMINI_OAUTH_REDIRECT_URI);
  url.searchParams.set('scope', GEMINI_OAUTH_SCOPES.join(' '));
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.verifier);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return {
    url: url.toString(),
    verifier: pkce.verifier,
  };
}

async function fetchUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return undefined;

    const payload = (await response.json()) as { email?: string };
    return typeof payload.email === 'string' ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

export async function exchangeGemini(
  code: string,
  state: string,
): Promise<GeminiTokenExchangeResult> {
  try {
    requireOAuthConfig();

    if (!code) {
      return { type: 'failed', error: 'Missing authorization code' };
    }

    if (!state) {
      return { type: 'failed', error: 'Missing OAuth state/verifier' };
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        client_id: GEMINI_OAUTH_CLIENT_ID,
        client_secret: GEMINI_OAUTH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GEMINI_OAUTH_REDIRECT_URI,
        code_verifier: state,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return { type: 'failed', error: errorText };
    }

    const tokenPayload = (await tokenResponse.json()) as GeminiTokenResponse;
    if (!tokenPayload.refresh_token) {
      return { type: 'failed', error: 'No refresh token received from Google OAuth.' };
    }

    const email = await fetchUserEmail(tokenPayload.access_token);

    return {
      type: 'success',
      refresh: tokenPayload.refresh_token,
      access: tokenPayload.access_token,
      expires: Date.now() + tokenPayload.expires_in * 1000,
      email,
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error instanceof Error ? error.message : 'Unknown OAuth exchange error',
    };
  }
}
