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
  return [tokenData, setTokenData];
}

export function getStoredTokenData(): GitHubTokenData | null {
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

export function clearStoredTokenData(): void {
  localStorage.removeItem(STORAGE_KEY);
  clearOldToken();
}

export async function exchangeAccessToken(code: string) {
  try {
    const newData = toGitHubTokenData(await client.exchangeOAuthCode(code));

    setStoredTokenData(newData);
    return newData;
  } catch (error) {
    clearStoredTokenData();
    throw error;
  }
}

export async function refreshAccessToken(): Promise<GitHubTokenData | null> {
  const currentData = getStoredTokenData();
  if (!currentData || !currentData.refreshToken) {
    return null;
  }

  try {
    const newData = toGitHubTokenData(
      await client.refreshOAuthToken(currentData.refreshToken),
    );

    setStoredTokenData(newData);
    return newData;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    clearStoredTokenData();
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
