import * as client from "../api/client.ts";

const STORAGE_KEY = "repoyear_github_token_data";
const OLD_STORAGE_KEY = "github_token";

export interface GitHubTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
}

export function getTokenData(): GitHubTokenData | null {
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

export function setTokenData(data: GitHubTokenData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearTokenData(): void {
  localStorage.removeItem(STORAGE_KEY);
  clearOldToken();
}

export async function refreshAccessToken(): Promise<GitHubTokenData | null> {
  const currentData = getTokenData();
  if (!currentData || !currentData.refreshToken) {
    return null;
  }

  try {
    const response = await client.refreshOAuthToken(
      currentData.refreshToken,
    );

    const now = Date.now();
    const newData: GitHubTokenData = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: response.expiresIn
        ? now + response.expiresIn * 1000
        : undefined,
      refreshTokenExpiresAt: response.refreshTokenExpiresIn
        ? now + response.refreshTokenExpiresIn * 1000
        : undefined,
    };

    setTokenData(newData);
    return newData;
  } catch (error) {
    console.error("Failed to refresh token:", error);
    clearTokenData();
    return null;
  }
}

function clearOldToken(): void {
  if (localStorage.getItem(OLD_STORAGE_KEY)) {
    localStorage.removeItem(OLD_STORAGE_KEY);
  }
}
