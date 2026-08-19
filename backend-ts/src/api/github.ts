// GitHub OAuth token exchange.

import type { Logger } from "../logging.ts";

export interface OAuthCredentials {
  githubClientId: string;
  githubClientSecret: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

export type OAuthResult =
  | { ok: true; value: OAuthTokenResponse }
  | { ok: false; error: string };

/** The response shape from https://github.com/login/oauth/access_token. */
interface GitHubTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

async function requestGitHubToken(
  body: Record<string, string>,
  errorContext: string,
  logger: Logger,
): Promise<OAuthResult> {
  let response: Response;
  try {
    response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    logger.error(`${errorContext} request failed: ${error}`);
    return { ok: false, error: "Service temporarily unavailable" };
  }

  let tokenData: GitHubTokenResponse;
  try {
    tokenData = await response.json();
  } catch (error) {
    logger.error(`Failed to parse ${errorContext} response: ${error}`);
    return { ok: false, error: "Internal server error" };
  }

  if (tokenData.error !== undefined) {
    logger.error(`Error in ${errorContext} response: ${tokenData.error}`);
    return {
      ok: false,
      error: tokenData.error_description ?? `${errorContext} failed`,
    };
  }

  if (tokenData.access_token === undefined) {
    return { ok: false, error: "Internal server error" };
  }

  return {
    ok: true,
    value: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      refresh_token_expires_in: tokenData.refresh_token_expires_in,
    },
  };
}

/** Exchange a GitHub OAuth code for an access token. */
export async function exchangeOAuthToken(
  credentials: OAuthCredentials,
  code: string,
  logger: Logger,
): Promise<OAuthResult> {
  return await requestGitHubToken(
    {
      client_id: credentials.githubClientId,
      client_secret: credentials.githubClientSecret,
      code,
    },
    "OAuth",
    logger,
  );
}

/** Refresh a GitHub OAuth access token using a refresh token. */
export async function refreshOAuthToken(
  credentials: OAuthCredentials,
  refreshToken: string,
  logger: Logger,
): Promise<OAuthResult> {
  return await requestGitHubToken(
    {
      client_id: credentials.githubClientId,
      client_secret: credentials.githubClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    },
    "OAuth refresh",
    logger,
  );
}
