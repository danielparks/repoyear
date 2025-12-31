import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as github from "./github/api.ts";
import { exchangeOAuthCode } from "./api/client.ts";
import {
  CONTRIBUTIONS_QUERY_TEMPLATE,
  type GithubError,
} from "./github/api.ts";
import { Calendar } from "./model/index.ts";
import { RepoYearView } from "./components/RepoYearView.tsx";
import { Footer } from "./components/Footer.tsx";
import { Icon } from "./components/Icon.tsx";
import { getAppVersion } from "./version.ts";
import { useKeyMonitor } from "./hooks/useKeyMonitor.ts";
import {
  clearTokenData as clearStoredTokenData,
  getTokenData as getStoredTokenData,
  type GitHubTokenData,
  refreshAccessToken,
  setTokenData as saveTokenData,
} from "./auth/tokenManager.ts";

function getAuthCode() {
  const code = new URLSearchParams(location.search).get("code");
  if (code) {
    // Remove code parameter.
    history.replaceState({}, document.title, location.pathname);
  }
  return code;
}

function getAuthError() {
  // Example error URL from GitHub: http://localhost:5173/?error=access_denied&error_description=The+user+has+denied+your+application+access.&error_uri=https%3A%2F%2Fdocs.github.com%2Fapps%2Fmanaging-oauth-apps%2Ftroubleshooting-authorization-request-errors%2F%23access-denied
  const message = new URLSearchParams(location.search).get("error_description");
  if (message) {
    // Remove error parameters.
    history.replaceState({}, document.title, location.pathname);
    return message;
  }
  return null;
}

function githubLoginUrl() {
  const redirectUrl = import.meta.env.VITE_FRONTEND_URL;
  if (!redirectUrl) {
    throw new Error(
      "Frontend URL not found; make sure VITE_FRONTEND_URL is set in your " +
        " .env file.",
    );
  }

  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "GitHub Client ID not found; make sure VITE_GITHUB_CLIENT_ID is set in " +
        " your .env file.",
    );
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUrl);
  url.searchParams.set("scope", "");
  return url;
}

export default function App({ username }: { username: string | null }) {
  const [tokenData, setTokenData] = useState<GitHubTokenData | null>(
    getStoredTokenData(),
  );
  const [authError, setAuthError] = useState<string | null>(getAuthError);
  const [authCode, setAuthCode] = useState<string | null>(getAuthCode);
  const authCodeHandled = useRef<boolean>(false);
  const startedFetch = useRef<boolean>(false);
  const shiftPressed = useKeyMonitor("Shift");
  const queryClient = useQueryClient();

  // loading and loadingPercent are separate because when we calculate the
  // loading percentage we don't know if the query has finished. We might
  // calculate it to be 97% done, but if the query is finished then we know it
  // is actually 100%.
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingPercent, setLoadingPercent] = useState<number>(0);

  // Handle OAuth callback.
  useEffect(() => {
    if (!tokenData && authCode && !authCodeHandled.current) {
      authCodeHandled.current = true;
      exchangeOAuthCode(authCode).then((response) => {
        if (response.accessToken) {
          setAuthError(null);
          const now = Date.now();
          const newTokenData: GitHubTokenData = {
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            expiresAt: response.expiresIn
              ? now + response.expiresIn * 1000
              : undefined,
            refreshTokenExpiresAt: response.refreshTokenExpiresIn
              ? now + response.refreshTokenExpiresIn * 1000
              : undefined,
          };
          saveTokenData(newTokenData); // Save to localStorage
          setTokenData(newTokenData); // Update React state
        } else {
          setAuthError("Error during authentication");
          console.error("No token in GitHub response");
        }
      }).catch((error: unknown) => {
        setAuthError("Error during authentication");
        console.error("Error getting oauth token:", error);
      }).finally(() => {
        // Whatever happened, the authCode is now invalid.
        setAuthCode(null);
      });
    }
  }, [authCode, tokenData]);

  const queryKey = [
    "contributions.2",
    CONTRIBUTIONS_QUERY_TEMPLATE,
    tokenData?.accessToken,
    username,
  ];
  const query = useQuery({
    enabled: !!tokenData,
    queryKey,
    queryFn: async () => {
      if (!tokenData) {
        // Redundant; enabled condition requires tokenData not to be null.
        throw new Error("Access token is required");
      }
      startedFetch.current = true;
      setLoading(true);
      setLoadingPercent(0);
      setAuthError(null); // The ability to query implies we're authenticated.

      const gh = new github.GitHub(tokenData.accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      try {
        for await (
          const contribution of gh.queryBase(username || undefined)
        ) {
          contributions.push(contribution);
          // Incrementally update cache, triggering a re-render.
          queryClient.setQueryData(queryKey, {
            complete: false,
            contributions: [...contributions],
          });
        }
      } catch (error: unknown) {
        // Check if this is a 401 error and try to refresh
        if (
          error &&
          typeof error === "object" &&
          "errors" in error &&
          Array.isArray((error as { errors: unknown[] }).errors) &&
          (error as { errors: { message?: string }[] }).errors.some((e) =>
            e.message?.includes("401")
          )
        ) {
          console.log("Token expired, attempting refresh...");
          const newTokenData = await refreshAccessToken();
          if (newTokenData) {
            setTokenData(newTokenData);
            // Retry the query by throwing an error that will be caught by React Query
            throw new Error("Token refreshed, please retry");
          } else {
            // Refresh failed
            setAuthError("Session expired. Please log in again.");
            throw error;
          }
        }
        throw error;
      }

      setLoading(false);
      return { complete: true, contributions };
    },
  });

  // Use startedFetch because query.isFetchedAfterMount seems to be true even
  // when no fetch has been done.
  if (!startedFetch.current && query.data && !query.data.complete) {
    // Incomplete data cached from a previous session.
    query.refetch().catch((error: unknown) => {
      console.error("Error refetching query:", error);
    });
  }

  const contributions = query.data?.contributions;

  // Progressively transform contributions into `Calendar`.
  const calendarRef = useRef<Calendar | null>(null);
  const calendar = useMemo(() => {
    if (contributions) {
      calendarRef.current ??= new Calendar(contributions[0].name);

      let specific = 0;
      for (const contribution of contributions) {
        specific += calendarRef.current.updateFromContributions(contribution);
      }

      const summary = contributions[0].calendar?.totalContributions;
      if (summary) {
        setLoadingPercent(Math.round(100 * specific / summary));
      }
    }

    return calendarRef.current;
  }, [contributions]);

  let errorMessage = authError;
  if (query.error) {
    console.error("Error querying GitHub:", query.error);
    if (!errorMessage) {
      // errorMessage should always be null if we managed to make a query.
      const errors = (query.error as GithubError).errors || [];
      if (
        username && errors[0]?.type == "NOT_FOUND" &&
        errors[0].path.join("/") == "user"
      ) {
        errorMessage = `Could not find user “${username}”`;
      } else {
        errorMessage = "Error getting contribution data";
      }
    }
  }

  function logout(): void {
    setTokenData(null);
    clearStoredTokenData();
  }

  function reload() {
    if (shiftPressed) {
      calendarRef.current = null;
    }
    setLoading(true);
    setLoadingPercent(0);
    query.refetch().catch((error: unknown) => {
      console.error("Error refetching query:", error);
    });
  }

  if (tokenData === null) {
    let loginUrl: string | null = null;

    if (!authCode) {
      // No tokenData, no authCode: user is logged out.
      try {
        loginUrl = githubLoginUrl().href;
      } catch (error: unknown) {
        console.error("Error getting GitHub login URL:", error);
        errorMessage = "Configuration error. Couldn’t get GitHub login URL.";
      }
    }

    return (
      <div className="login-container">
        <div>
          <h1>
            <Icon /> RepoYear
          </h1>
          <p>Visualize your GitHub contributions over time.</p>
          {errorMessage && <div className="error-message">{errorMessage}</div>}
          <p>
            {loginUrl && (
              <a href={loginUrl} className="button">Log in with GitHub</a>
            )}
            {authCode && <span className="pressed-button">Logging in…</span>}
          </p>
          <p className="access-description">
            This only requests read-only access to your public repositories.
            This is the minimum access required to use the GitHub GraphQL API.
          </p>
        </div>
      </div>
    );
  }

  let refreshStyle: React.CSSProperties = {};
  if (loading) {
    refreshStyle = {
      "--progress": `${Math.max(10, loadingPercent)}%`,
    } as React.CSSProperties;
  }

  const name = calendar?.name ?? username;
  return (
    <>
      <header className="app-header">
        <h1>
          <Icon /> {name
            ? (
              <>
                <span>RepoYear:</span> {name}
              </>
            )
            : "RepoYear"}
        </h1>
        <div className="button-group">
          <button
            type="button"
            onClick={reload}
            className={`refresh-button${loading ? " loading" : ""}`}
            style={refreshStyle}
          >
            {loading ? "Loading" : shiftPressed ? "Reload" : "Refresh"}
          </button>
          <button type="button" onClick={logout} className="logout-button">
            Log out
          </button>
        </div>
      </header>
      {errorMessage && <div className="error-message">{errorMessage}</div>}
      {calendar
        ? <RepoYearView calendar={calendar} />
        : <div className="info-message">No contributions data</div>}
      <Footer
        version={getAppVersion()}
        lastFetched={query.dataUpdatedAt}
        githubAppLink
      />
    </>
  );
}
