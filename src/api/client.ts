/**
 * Type-safe API client for the backend.
 *
 * This client uses the Oxide OpenAPI generator which provides excellent error
 * handling including proper handling of empty 500 responses.
 */

import Api from "./Api.ts";
import type { ApiResult, OAuthTokenResponse } from "./Api.ts";
export type { OAuthTokenResponse } from "./Api.ts";

/**
 * API client instance configured for the backend.
 *
 * The baseURL defaults to the current origin, which works with the Vite dev
 * proxy that forwards `/api` to the backend on port 3000.
 */
export const api = new Api({
  // Remove trailing slash since Api client just appends the path, which always
  // starts with a /.
  host: (import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_FRONTEND_URL ||
    "").replace(/\/+$/, ""),
});

/**
 * Exchange GitHub OAuth code for access token.
 *
 * @param code - The authorization code from GitHub OAuth callback
 * @returns The token response on success
 */
export async function exchangeOAuthCode(
  code: string,
): Promise<OAuthTokenResponse> {
  return toOAuthTokenResponse(
    "callback",
    await api.methods.oauthCallback({ query: { code } }),
  );
}

/**
 * Refresh GitHub OAuth access token.
 *
 * @param refreshToken - The refresh token from the initial OAuth exchange
 * @returns The new token response on success
 */
export async function refreshOAuthToken(
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  return toOAuthTokenResponse(
    "refresh",
    await api.methods.oauthRefresh({ query: { refreshToken } }),
  );
}

/**
 * Check for errors and convert API response type to our response type.
 */
function toOAuthTokenResponse(
  context: string,
  result: ApiResult<OAuthTokenResponse>,
): OAuthTokenResponse {
  if (result.type === "error") {
    throw new Error(`OAuth ${context} API error: ${result.data.message}`);
  } else if (result.type === "client_error") {
    throw new Error(`OAuth ${context} client error: ${result.error.message}`);
  } else {
    return result.data;
  }
}
