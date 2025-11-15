import "./App.css";
import { useEffect, useState } from "react";
import { graphql } from "@octokit/graphql";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export interface ViewerContributions {
  login: string;
  name: string;
  contributionsCollection: ContributionsCollection;
}

export interface ContributionsCollection {
  contributionCalendar: ContributionCalendar;
}

export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
}

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [info, setInfo] = useState<ViewerContributions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle OAuth callback. Runs only on mount.
  useEffect(() => {
    (async () => {
      if (accessToken) {
        return;
      }

      const code = new URLSearchParams(document.location.search).get("code");
      if (!code) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/oauth/callback", BACKEND_URL);
        url.searchParams.set("code", code);
        const response = await fetch(url);
        const data = await response.json() as { access_token?: string };

        if (data.access_token) {
          setAccessToken(data.access_token);
          localStorage.setItem("github_token", data.access_token);
          history.replaceState({}, document.title, "/");
        } else {
          setError("Failed to authenticate with GitHub");
        }
      } finally {
        setLoading(false);
      }
    })().catch((error: unknown) => {
      setError("Error during authentication");
      console.error(error);
    });
    // This should only run on mount, not when accessToken changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setInfo(null);
      return;
    }
    graphql({
      query: `query {
        viewer {
          login
          name
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                }
              }
            }
          }
        }
      }`,
      headers: {
        authorization: `token ${accessToken}`,
      },
    }).then((result: unknown) => {
      const { viewer } = result as { viewer: ViewerContributions };
      setInfo(viewer);
    }).catch((error: unknown) => {
      console.error("Error getting contribution data", error);
      setError("Error getting contribution data");
    });
  }, [accessToken]);

  function login(): void {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (!clientId) {
      setError(
        "GitHub Client ID not found. Set VITE_GITHUB_CLIENT_ID in your .env file.",
      );
      return;
    }

    const redirect = new URL("https://github.com/login/oauth/authorize");
    redirect.searchParams.set("client_id", clientId);
    redirect.searchParams.set("redirect_uri", BASE_URL);
    redirect.searchParams.set("scope", "repo");
    document.location.href = redirect.href;
  }

  function logout(): void {
    setAccessToken(null);
    localStorage.removeItem("github_token");
  }

  if (loading) {
    return <b>Loading</b>;
  }

  if (accessToken === null) {
    return (
      <>
        {error && <h3>Error: {error}</h3>}
        <button type="button" onClick={login}>Log in</button>
      </>
    );
  }

  return (
    <>
      <h1>Test</h1>
      {error && <h3>Error: {error}</h3>}
      <pre>{JSON.stringify(info)}</pre>
      <button type="button" onClick={logout}>Log out</button>
    </>
  );
}
