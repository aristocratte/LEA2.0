/**
 * Claude Code OAuth flow for LEA Platform
 *
 * Uses the public Claude Code OAuth client (no secret needed — PKCE public client).
 * The resulting access token is stored as oauth_access_token in the DB and used
 * directly as a Bearer token for Anthropic API calls.
 *
 * OAuth endpoints:
 *   Authorize: https://claude.ai/api/oauth/authorize
 *   Token:     https://claude.ai/api/oauth/token
 *
 * Scopes: org:create_api_key user:profile user:inference
 */

import crypto from 'crypto';

// Public OAuth client ID for Claude Code (no client secret required — PKCE)
export const CLAUDE_CODE_CLIENT_ID = '9d1c250a-e61b-48f7-8ad3-ff3dd5f52727';

export const CLAUDE_AUTH_URL = 'https://claude.ai/api/oauth/authorize';
export const CLAUDE_TOKEN_URL = 'https://claude.ai/api/oauth/token';
export const CLAUDE_REDIRECT_URI = 'http://localhost:51121/oauth-callback';
export const CLAUDE_SCOPES = 'org:create_api_key user:profile user:inference';

export interface AnthropicOAuthAuthorization {
  url: string;
  /** PKCE verifier — stored in state param so it survives the redirect */
  state: string;
}

export interface AnthropicTokenExchangeResult {
  type: 'success' | 'failed';
  /** Short-lived access token — used as Bearer for the Anthropic API */
  access?: string;
  /** Long-lived refresh token for silent re-auth */
  refresh?: string;
  /** Expiry timestamp (ms since epoch) */
  expires?: number;
  email?: string;
  error?: string;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function authorizeAnthropic(): Promise<AnthropicOAuthAuthorization> {
  const pkce = generatePKCE();

  const url = new URL(CLAUDE_AUTH_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLAUDE_CODE_CLIENT_ID);
  url.searchParams.set('redirect_uri', CLAUDE_REDIRECT_URI);
  url.searchParams.set('scope', CLAUDE_SCOPES);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Store verifier in state so we can use it after redirect
  url.searchParams.set('state', pkce.verifier);

  return { url: url.toString(), state: pkce.verifier };
}

export async function exchangeAnthropic(
  code: string,
  state: string,
): Promise<AnthropicTokenExchangeResult> {
  try {
    const verifier = state; // state param carries the PKCE verifier (same pattern as Gemini)

    const tokenResponse = await fetch(CLAUDE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CLAUDE_REDIRECT_URI,
        client_id: CLAUDE_CODE_CLIENT_ID,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      return { type: 'failed', error };
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    if (!tokenData.access_token) {
      return { type: 'failed', error: 'No access token in response' };
    }

    // Try to fetch user email from Anthropic
    let email: string | undefined;
    try {
      const meResp = await fetch('https://api.anthropic.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'anthropic-version': '2023-06-01',
        },
      });
      if (meResp.ok) {
        const me = (await meResp.json()) as { email?: string };
        email = me.email;
      }
    } catch {
      // email is optional
    }

    return {
      type: 'success',
      access: tokenData.access_token,
      refresh: tokenData.refresh_token,
      expires: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      email,
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error instanceof Error ? error.message : 'Unknown OAuth exchange error',
    };
  }
}

export async function refreshAnthropicToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch(CLAUDE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLAUDE_CODE_CLIENT_ID,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Anthropic token: ' + (await response.text()));
  }

  return response.json();
}
