/**
 * Type-safe API client for the backend.
 *
 * This client uses the Oxide OpenAPI generator which provides excellent error
 * handling including proper handling of empty 500 responses.
 */

import Api from "./Api.ts";

/**
 * API client instance configured for the backend.
 *
 * The baseURL defaults to the current origin, which works with the Vite dev
 * proxy that forwards `/api` to the backend on port 3000.
 */
export const api = new Api({
  host: import.meta.env.VITE_BACKEND_URL || "",
});

/**
 * Exchange GitHub OAuth code for access token.
 *
 * @param code - The authorization code from GitHub OAuth callback
 * @returns The access token on success, or undefined on error
 */
export async function exchangeOAuthCode(
  code: string,
): Promise<string | undefined> {
  const result = await api.methods.oauthCallback({ query: { code } });

  if (result.type === "error") {
    throw new Error(`OAuth callback API error: ${result.data.message}`);
  } else if (result.type === "client_error") {
    throw new Error(`OAuth callback client error: ${result.error.message}`);
  } else {
    return result.data.accessToken;
  }
}
