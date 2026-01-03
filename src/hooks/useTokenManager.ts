import { useState } from "react";
import type { OAuthTokenResponse } from "../api/client.ts";
import * as client from "../api/client.ts";

const STORAGE_KEY = "repoyear_github_token_data";
const OLD_STORAGE_KEY = "github_token";

export interface GitHubTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
}

export function useTokenManager() {
  const [tokenData, setTokenData] = useState<GitHubTokenData | null>(
    getStoredTokenData,
  );

  function clearTokenData() {
    localStorage.removeItem(STORAGE_KEY);
    setTokenData(null);
    clearOldToken();
  }

  async function exchangeAccessToken(code: string) {
    try {
      const newData = toGitHubTokenData(await client.exchangeOAuthCode(code));

      setTokenData(newData);
      setStoredTokenData(newData);
    } catch (error) {
      clearTokenData();
      throw error;
    }
  }

  async function refreshAccessToken() {
    if (!tokenData) {
      throw new Error("No token data");
    } else if (!tokenData.refreshToken) {
      throw new Error("No refresh token");
    }

    try {
      const newData = toGitHubTokenData(
        await client.refreshOAuthToken(tokenData.refreshToken),
      );

      setTokenData(newData);
      setStoredTokenData(newData);
    } catch (error) {
      clearTokenData();
      throw error;
    }
  }

  return { tokenData, clearTokenData, exchangeAccessToken, refreshAccessToken };
}

function getStoredTokenData(): GitHubTokenData | null {
  clearOldToken();

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as GitHubTokenData;
  } catch {
    return null;
  }
}

function toGitHubTokenData(response: OAuthTokenResponse): GitHubTokenData {
  const now = Date.now();
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? undefined,
    expiresAt: response.expiresIn ? now + response.expiresIn * 1000 : undefined,
    refreshTokenExpiresAt: response.refreshTokenExpiresIn
      ? now + response.refreshTokenExpiresIn * 1000
      : undefined,
  };
}

function setStoredTokenData(data: GitHubTokenData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearOldToken(): void {
  if (localStorage.getItem(OLD_STORAGE_KEY)) {
    localStorage.removeItem(OLD_STORAGE_KEY);
  }
}
