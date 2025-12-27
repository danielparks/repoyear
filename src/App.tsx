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
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [authError, setAuthError] = useState<string | null>(getAuthError);
  const [authCode, setAuthCode] = useState<string | null>(getAuthCode);
  const authCodeHandled = useRef<boolean>(false);
  const startedFetch = useRef<boolean>(false);
  const [shiftPressed, setShiftPressed] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // loading and loadingPercent are separate because when we calculate the
  // loading percentage we don’t know if the query has finished. We might
  // calculate it to be 97% done, but if the query is finished then we know it
  // is actually 100%.
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingPercent, setLoadingPercent] = useState<number>(0);

  // Track shift key state.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftPressed(false);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Handle OAuth callback.
  useEffect(() => {
    if (!accessToken && authCode && !authCodeHandled.current) {
      authCodeHandled.current = true;
      exchangeOAuthCode(authCode).then((token) => {
        if (token) {
          setAuthError(null);
          setAccessToken(token);
          // This is available to the entire origin. Cookies aren’t any better;
          // see https://developer.mozilla.org/en-US/docs/Web/API/Document/cookie#security
          localStorage.setItem("github_token", token);
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
  }, [authCode, accessToken]);

  const queryKey = [
    "contributions.2",
    CONTRIBUTIONS_QUERY_TEMPLATE,
    accessToken,
    username,
  ];
  const query = useQuery({
    enabled: !!accessToken,
    queryKey,
    queryFn: async () => {
      if (!accessToken) {
        // Redundant; enabled condition requires accessToken not to be null.
        throw new Error("Access token is required");
      }
      startedFetch.current = true;
      setLoading(true);
      setLoadingPercent(0);
      setAuthError(null); // The ability to query implies we’re authenticated.

      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      for await (const contribution of gh.queryBase(username || undefined)) {
        contributions.push(contribution);
        // Incrementally update cache, triggering a re-render.
        queryClient.setQueryData(queryKey, {
          complete: false,
          contributions: [...contributions],
        });
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
    setAccessToken(null);
    localStorage.removeItem("github_token");
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

  if (accessToken === null) {
    let loginUrl: string | null = null;

    if (!authCode) {
      // No accessToken, no authCode: user is logged out.
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
        <h1>
          <Icon /> RepoYear
          {name && `: ${name}`}
        </h1>
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
