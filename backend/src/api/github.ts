// GitHub OAuth token exchange, via @octokit/oauth-methods.

import {
  exchangeWebFlowCode,
  refreshToken as octokitRefreshToken,
} from "@octokit/oauth-methods";
import { RequestError } from "@octokit/request-error";
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

/**
 * The two shapes GitHub's token endpoint returns for a GitHub App,
 * depending on whether the app has user-token expiration enabled.
 */
type GitHubAppTokenData =
  | { access_token: string; token_type: string }
  | {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
  };

function toOAuthTokenResponse(data: GitHubAppTokenData): OAuthTokenResponse {
  return {
    access_token: data.access_token,
    refresh_token: "refresh_token" in data ? data.refresh_token : undefined,
    expires_in: "expires_in" in data ? data.expires_in : undefined,
    refresh_token_expires_in: "refresh_token_expires_in" in data
      ? data.refresh_token_expires_in
      : undefined,
  };
}

/**
 * GitHub's OAuth token endpoint always responds 200, even on failure --
 * `@octokit/oauth-methods` detects that itself (by checking for an `error`
 * field in the body) and raises it as a `RequestError` with `status: 400`.
 * Any other status means the *request* failed (network error, a genuine
 * HTTP error from GitHub, etc.), which shouldn't be relayed to the client
 * verbatim.
 */
function handleOAuthError(
  error: unknown,
  errorContext: string,
  logger: Logger,
): OAuthResult {
  if (error instanceof RequestError && error.status === 400) {
    logger.error(`Error in ${errorContext} response: ${error.message}`);
    return { ok: false, error: error.message };
  }
  logger.error(`${errorContext} request failed: ${error}`);
  return { ok: false, error: "Service temporarily unavailable" };
}

/** Exchange a GitHub OAuth code for an access token. */
export async function exchangeOAuthToken(
  credentials: OAuthCredentials,
  code: string,
  logger: Logger,
): Promise<OAuthResult> {
  try {
    const response = await exchangeWebFlowCode({
      clientType: "github-app",
      clientId: credentials.githubClientId,
      clientSecret: credentials.githubClientSecret,
      code,
    });
    return { ok: true, value: toOAuthTokenResponse(response.data) };
  } catch (error) {
    return handleOAuthError(error, "OAuth", logger);
  }
}

/** Refresh a GitHub OAuth access token using a refresh token. */
export async function refreshOAuthToken(
  credentials: OAuthCredentials,
  refreshToken: string,
  logger: Logger,
): Promise<OAuthResult> {
  try {
    const response = await octokitRefreshToken({
      clientType: "github-app",
      clientId: credentials.githubClientId,
      clientSecret: credentials.githubClientSecret,
      refreshToken,
    });
    return { ok: true, value: toOAuthTokenResponse(response.data) };
  } catch (error) {
    return handleOAuthError(error, "OAuth refresh", logger);
  }
}
