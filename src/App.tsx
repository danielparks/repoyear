import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as github from "./github/api.ts";
import {
  CONTRIBUTIONS_QUERY_TEMPLATE,
  type GithubError,
} from "./github/api.ts";
import * as client from "./api/client.ts";
import { Calendar } from "./model/index.ts";
import { RepoYearView } from "./components/RepoYearView.tsx";
import { Footer } from "./components/Footer.tsx";
import { Icon } from "./components/Icon.tsx";
import { getAppVersion } from "./version.ts";
import { useTokenManager } from "./hooks/useTokenManager.ts";
import { arrayStartsWith, sum } from "./util.ts";

export default function App(
  {
    username = null,
    authCode: initialAuthCode = null,
    authError: initialAuthError = null,
    frontendUrl,
    githubClientId,
  }: {
    username?: string | null;
    authCode?: string | null;
    authError?: string | null;
    frontendUrl: string;
    githubClientId: string;
  },
) {
  const { tokenData, clearTokenData, exchangeAccessToken, refreshAccessToken } =
    useTokenManager();
  const [authError, setAuthError] = useState<string | null>(initialAuthError);
  const [authCode, setAuthCode] = useState<string | null>(initialAuthCode);
  const [localContributions, setLocalContributions] = useState<
    Record<string, number[]> | null
  >(null);
  const authCodeHandled = useRef<boolean>(false);
  const startedFetch = useRef<boolean>(false);
  const queryClient = useQueryClient();

  // loading and loadingPercent are separate because when we calculate the
  // loading percentage we don’t know if the query has finished. We might
  // calculate it to be 97% done, but if the query is finished then we know it
  // is actually 100%.
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingPercent, setLoadingPercent] = useState<number>(0);

  // Handle OAuth callback.
  useEffect(() => {
    if (!tokenData && authCode && !authCodeHandled.current) {
      authCodeHandled.current = true;
      exchangeAccessToken(authCode).then(() => {
        setAuthError(null);
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
      setAuthError(null); // The ability to query implies we’re authenticated.

      const gh = new github.GitHub(tokenData.accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      try {
        for await (const contribution of gh.queryBase(username || undefined)) {
          contributions.push(contribution);
          // Incrementally update cache, triggering a re-render.
          queryClient.setQueryData(queryKey, {
            complete: false,
            contributions: [...contributions],
          });
        }
      } catch (error: unknown) {
        // Check if this is a 401 error and try to refresh
        const e = error as { name?: string; status?: number } | null;
        if (e && e.name == "HttpError" && e.status == 401) {
          console.log("Token expired, attempting refresh...");
          try {
            await refreshAccessToken();
          } catch (error: unknown) {
            // Refresh failed
            console.error("Error refreshing oauth token:", error);
            setAuthError("Session expired. Please log in again.");
            throw error;
          }
          // The accessToken changed, so next tick this will reload.
          return { complete: false, contributions: [] };
        } else {
          throw error;
        }
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

  useEffect(() => {
    if (query?.data?.complete) {
      setLoading(false);
    }
  }, [query?.data?.complete]);

  const contributions = query.data?.contributions;

  useEffect(() => {
    if (localContributions === null) {
      client.getContributions()
        .then(setLocalContributions)
        .catch((error: unknown) => {
          console.error("Error getting local contributions:", error);
        });
    }
  }, [localContributions]);

  // Persists the partially-folded Calendar across renders so each new
  // contributions chunk is processed only once (O(chunks) total vs O(chunks²)).
  const prevContribRef = useRef<
    {
      gitHub: github.Contributions[];
      local: Record<string, number[]>[];
      calendar: Calendar;
    } | null
  >(null);

  // Progressively transform contributions into `Calendar`.
  const calendar = useMemo(() => {
    const years = 1;
    const gitHub = contributions || [];
    const local: Record<string, number[]>[] = localContributions
      ? [localContributions]
      : [];
    const prev = prevContribRef.current;

    let calendar: Calendar;
    if (
      gitHub.length &&
      prev &&
      prev.local === local &&
      arrayStartsWith(gitHub, prev.gitHub)
    ) {
      // Possible updates from GitHub and local contributions haven’t changed.
      calendar = prev.calendar;
      calendar.appendGitHubUpdates(gitHub.slice(prev.gitHub.length));
    } else {
      // Something changed that requires full regeneration.
      calendar = Calendar.fromContributions({ gitHub, local, years });
    }

    // Calculate progress bar.
    //
    // We divide this up by years. If there are are three years, then during
    // the first year we fill up the first third of the bar based on the
    // specific contributions from that year.

    // Get just the chunks with summary data (they start each year).
    const summaryTotals = gitHub.flatMap((chunk) =>
      chunk.calendar?.totalContributions ?? []
    );
    const specificTotal = calendar.gitHubSpecificCount || 0;

    // specificTotal counts all of the GitHub specific contributions, not just
    // the year-in-progress. Sum up the summary totals from completed years and
    // subtract them from specificTotal to get the number of specific
    // contributions for the in-progress year.
    const lastSummaryTotal = summaryTotals.pop();
    // summaryTotals is now only completed years.
    const lastSpecificTotal = specificTotal - sum(summaryTotals, (n) => n);

    let progress = 0; // if lastSummaryTotal === undefined
    if (lastSummaryTotal) {
      progress = summaryTotals.length / years +
        lastSpecificTotal / lastSummaryTotal;
    } else if (lastSummaryTotal === 0) {
      // The last year had no summary contributions, so it’s complete.
      progress = (summaryTotals.length + 1) / years;
    }

    setLoadingPercent(Math.round(100 * progress));
    prevContribRef.current = { gitHub, local, calendar };

    return calendar;
  }, [query.data, contributions, localContributions]);

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
    clearTokenData();
  }

  function reload() {
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
      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", githubClientId);
      url.searchParams.set("redirect_uri", frontendUrl);
      url.searchParams.set("scope", "");
      if (username) {
        url.searchParams.set("state", username);
      }
      loginUrl = url.href;
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

  const name = calendar.name ?? username;
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
            {loading ? "Loading" : "Reload"}
          </button>
          <button type="button" onClick={logout} className="logout-button">
            Log out
          </button>
        </div>
      </header>
      {errorMessage && <div className="error-message">{errorMessage}</div>}
      <RepoYearView
        calendar={calendar}
        // The reload button immediately sets loading=true, but the partial new
        // data isn’t displayed until it comes in, so it looks weird if the
        // Calendar immediately switches to loading mode.
        loading={loading && !query?.data?.complete}
      />
      <Footer
        version={getAppVersion()}
        lastFetched={query.dataUpdatedAt}
        githubAppLink
      />
    </>
  );
}
