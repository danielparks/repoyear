import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as github from "./github/api.ts";
import { exchangeOAuthCode } from "./api/client.ts";
import githubMarkUrl from "./github/github-mark.svg";
import {
  CONTRIBUTIONS_QUERY_TEMPLATE,
  type GithubError,
} from "./github/api.ts";
import { Calendar, Day, Filter, Repository } from "./model.ts";

const FRONTEND_URL: string =
  (import.meta.env.VITE_FRONTEND_URL as string | undefined) ||
  "http://localhost:5173";

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

export default function App({ username }: { username: string | null }) {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [authError, setAuthError] = useState<string | null>(getAuthError);
  const [authCode, setAuthCode] = useState<string | null>(getAuthCode);
  const authCodeHandled = useRef<boolean>(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [repoFilter, setRepoFilter] = useState<Filter>(() => new Filter());
  const queryClient = useQueryClient();

  // Handle OAuth callback.
  useEffect(() => {
    if (!accessToken && authCode && !authCodeHandled.current) {
      authCodeHandled.current = true;
      exchangeOAuthCode(authCode).then((token) => {
        if (token) {
          setAuthError(null);
          setAccessToken(token);
          // FIXME? This will be available to the entire origin.
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
    "contributions",
    CONTRIBUTIONS_QUERY_TEMPLATE,
    accessToken,
    username,
  ];
  const {
    data: contributions,
    error: queryError,
  } = useQuery({
    enabled: !!accessToken,
    queryKey,
    queryFn: async () => {
      if (!accessToken) {
        // Redundant; enabled condition requires accessToken not to be null.
        throw new Error("Access token is required");
      }
      setLoading(true);
      setAuthError(null); // The ability to query implies we’re authenticated.

      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      for await (const contribution of gh.queryBase(username || undefined)) {
        contributions.push(contribution);
        // Incrementally update cache, triggering a re-render.
        queryClient.setQueryData(queryKey, [...contributions]);
      }

      setLoading(false);
      return contributions;
    },
  });

  // Transform contributions to Calendar model
  const calendar = useMemo(() => {
    if (!contributions || contributions.length === 0) {
      return null;
    }

    const calendar = Calendar.fromContributions(contributions[0]);
    for (const contrib of contributions.slice(1)) {
      calendar.updateFromContributions(contrib);
    }
    return calendar;
  }, [contributions]);

  // Update repoFilter with newly loaded repositories.
  useEffect(() => {
    if (!calendar) {
      return;
    }

    setRepoFilter((old) =>
      old.addReposIfMissing([...calendar.repoUrls()]) || old
    );
  }, [calendar]);

  let errorMessage = authError;
  if (queryError) {
    console.error("Error querying GitHub:", queryError);
    if (!errorMessage) {
      // errorMessage should always be null if we managed to make a query.
      const errors = (queryError as GithubError).errors || [];
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
    setLoading(true);
    queryClient.refetchQueries({ queryKey }).catch((error: unknown) => {
      console.error("Error refetching query:", error);
    });
  }

  if (accessToken === null) {
    let loginUrl: string | null = null;

    if (!authCode) {
      // No accessToken, no authCode: user is logged out.
      try {
        loginUrl = github.loginUrl(FRONTEND_URL).href;
      } catch (error: unknown) {
        console.error("Error getting GitHub login URL:", error);
        errorMessage = "Configuration error. Could get GitHub login URL.";
      }
    }

    return (
      <div className="login-container">
        <h1>GitHub Contribution Graph</h1>
        <p>View and analyze your GitHub contributions over time</p>
        {errorMessage && <div className="error-message">{errorMessage}</div>}
        {loginUrl && (
          <a href={loginUrl} className="button">
            Log in with GitHub
          </a>
        )}
        {authCode && (
          <div className="pressed-button">
            Logging in…
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <h1>
          Contribution Graph
          {calendar && ` for ${calendar.name}`}
          {username && !calendar && ` for ${username}`}
        </h1>
        <div className="button-group">
          <button type="button" onClick={reload}>
            Reload
          </button>
          <button type="button" onClick={logout} className="logout-button">
            Log out
          </button>
        </div>
      </header>
      {errorMessage && <div className="error-message">{errorMessage}</div>}
      {loading && !errorMessage && (
        <div className="loading-message">Loading contributions...</div>
      )}
      {calendar
        ? (
          <>
            <ContributionsGraph
              calendar={calendar}
              filter={repoFilter}
              highlight={highlight}
            />
            <RepositoryList
              calendar={calendar}
              filter={repoFilter}
              setFilter={setRepoFilter}
              setHighlight={setHighlight}
            />
          </>
        )
        : <div className="info-message">No contributions data</div>}
    </>
  );
}

function ContributionsGraph(
  { calendar, filter, highlight }: {
    calendar: Calendar;
    filter: Filter;
    highlight: string | null;
  },
) {
  const dayMax = calendar.maxContributions();

  return (
    <table className="contributions">
      <tbody>
        {[...calendar.weeks()].map((week) => (
          <tr key={`week ${week[0].date}`} className="week">
            {week.map((day) => (
              <GraphDay
                key={day.date.toString()}
                day={day}
                filter={filter}
                max={dayMax}
                highlight={highlight}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraphDay(
  { day, filter, max, highlight }: {
    day: Day;
    filter: Filter;
    max: number;
    highlight: string | null;
  },
) {
  const className: string[] = [];
  if (highlight && day.hasRepo(highlight)) {
    className.push("highlight");
  }

  function countToLightness(count: number) {
    if (count) {
      return 59 * (1 - count / max) + 40;
    } else {
      return 100;
    }
  }

  interface Subdivision {
    key: string;
    style: React.CSSProperties;
  }
  let subdivisions: Subdivision[] = [];
  let style = {};
  if (day.addsUp()) {
    subdivisions = day.filteredRepos(filter).map((repoDay) => ({
      key: repoDay.url(),
      style: {
        flex: repoDay.count(),
        background: repoDay.repository.color(
          countToLightness(day.filteredCount(filter)),
          0.1,
        ),
      },
    }));

    if (subdivisions.length == 0) {
      className.push("empty");
    }
  } else {
    const lightness = countToLightness(day.contributionCount || 0);
    className.push("unknown");
    style = {
      background: `hsl(270deg 40 ${lightness})`,
    };

    if (day.contributionCount === 0) {
      className.push("empty");
    }
  }

  return (
    <td style={style} className={className.join(" ")}>
      <DayInfo day={day} />
      <ol>
        {subdivisions.map(({ key, style }) => <li key={key} style={style} />)}
      </ol>
    </td>
  );
}

function DayInfo({ day }: { day: Day }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [classNames, setClassNames] = useState(["day-info"]);

  useEffect(() => {
    function checkOverflow() {
      // Check the overflow of the parent <td>.
      if (divRef.current && divRef.current.parentNode) {
        const rect = (divRef.current.parentNode as HTMLTableCellElement)
          .getBoundingClientRect();
        const newClassNames = ["day-info", "align-top"];
        // FIXME: this assumes the window is large enough.
        if (rect.right > globalThis.innerWidth - 460) {
          newClassNames.push("align-right");
        } else {
          newClassNames.push("align-left");
        }
        setClassNames(newClassNames);
      }
    }

    checkOverflow();
    addEventListener("resize", checkOverflow);

    return () => {
      removeEventListener("resize", checkOverflow);
    };
  }, []);

  return (
    <div ref={divRef} className={classNames.join(" ")}>
      <table>
        <tbody>
          {[...day.repositories.values()].map((repoDay) => (
            <tr key={repoDay.repository.url}>
              <td className="count">
                {repoDay.count()}
              </td>
              <th>
                {repoDay.repository.url} {repoDay.created > 0 && <>(Created)</>}
              </th>
            </tr>
          ))}
          {day.addsUp() ||
            (
              <tr key="unknown">
                <td className="count">
                  {(day.contributionCount || 0) - day.knownContributionCount()}
                </td>
                <th>
                  Unknown contributions
                </th>
              </tr>
            )}
        </tbody>
        <tfoot>
          <tr>
            <td className="count">
              {day.contributionCount}
            </td>
            <th></th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RepositoryList(
  { calendar, filter, setFilter, setHighlight }: {
    calendar: Calendar;
    filter: Filter;
    setFilter: React.Dispatch<React.SetStateAction<Filter>>;
    setHighlight: React.Dispatch<React.SetStateAction<string | null>>;
  },
) {
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const url = event.currentTarget.value;
    const newFilter = filter.clone();
    newFilter.switchRepo(url, event.currentTarget.checked);
    setFilter(newFilter);
  }
  return (
    <ol className="repository-list">
      {calendar.mostUsedRepos().map((repo) => (
        <li key={repo.url}>
          <label
            onMouseEnter={() => {
              setHighlight(repo.url);
            }}
            onMouseLeave={() => {
              // Only unset highlight if it was for this repo.
              setHighlight((old) => old == repo.url ? null : old);
            }}
          >
            <input
              type="checkbox"
              checked={filter.isOn(repo.url) || false}
              value={repo.url}
              onChange={onChange}
            />
            <h3>
              <RepositoryName repo={repo} />
            </h3>
            <Sparkline repo={repo} calendar={calendar} />
          </label>
        </li>
      ))}
    </ol>
  );
}

function RepositoryName({ repo }: { repo: Repository }) {
  return (
    <a style={{ color: repo.color() }} href={repo.url}>
      <img src={githubMarkUrl} alt="GitHub" />
      {repo.url.replace("https://github.com/", "")}
    </a>
  );
}

function Sparkline({ calendar, repo }: {
  calendar: Calendar;
  repo: Repository;
}) {
  const segments: Day[][] = [];
  const segmentLength = Math.ceil(calendar.days.length / 25);
  for (let i = 0; i < calendar.days.length; i += segmentLength) {
    segments.push(calendar.days.slice(i, i + segmentLength));
  }
  const segmentMax = Math.max(
    ...segments.map((days) =>
      days.reduce((total, day) => total + (day.contributionCount || 0), 0)
    ),
  );

  return (
    <div
      className="sparkline"
      style={{ borderBottomColor: repo.color(80, 0.05) }}
    >
      {segments.map((days) => (
        <SparklineElement
          key={days[0].date.toString()}
          days={days}
          repo={repo}
          max={segmentMax}
        />
      ))}
    </div>
  );
}

function SparklineElement({ days, repo, max }: {
  days: Day[];
  repo: Repository;
  max: number;
}) {
  const filter = Filter.withRepos(repo.url);
  const count = days.reduce(
    (total, day) => total + day.filteredCount(filter),
    0,
  );
  let height = 0;
  if (count) {
    height = 2 + 98 * count / max;
  }
  return (
    <div>
      <div style={{ height: `${height}%`, background: repo.color() }} />
    </div>
  );
}
