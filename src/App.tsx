import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as github from "./github/api.ts";
import githubMarkUrl from "./github/github-mark.svg";
import { CONTRIBUTIONS_QUERY_TEMPLATE } from "./github/api.ts";
import { Calendar, Day, Filter, Repository } from "./model.ts";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [repoFilter, setRepoFilter] = useState<Filter>(() => new Filter());
  const queryClient = useQueryClient();

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

      setAuthError(null);

      const token = await github.getToken(code, BACKEND_URL);
      if (token) {
        setAccessToken(token);
        // FIXME? This will be available to the entire origin.
        localStorage.setItem("github_token", token);
        history.replaceState({}, document.title, "/");
      } else {
        setAuthError("Failed to authenticate with GitHub");
      }
    })().catch((error: unknown) => {
      setAuthError("Error during authentication");
      console.error(error);
    });
    // This should only run on mount, not when accessToken changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryKey = ["contributions", CONTRIBUTIONS_QUERY_TEMPLATE, accessToken];
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

      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      for await (const contribution of gh.queryBase()) {
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

  // FIXME do we need to log queryError?
  const error = authError ||
    (queryError ? "Error getting contribution data" : null);

  function login(): void {
    try {
      github.redirectToLogin(BASE_URL);
    } catch (error: unknown) {
      console.error("Error redirecting to GitHub login:", error);
      setAuthError("Configuration error. Could not log into GitHub.");
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
    return (
      <div className="login-container">
        <h1>GitHub Contribution Graph</h1>
        <p>View and analyze your GitHub contributions over time</p>
        {error && <div className="error-message">{error}</div>}
        <button type="button" onClick={login}>
          Log in with GitHub
        </button>
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <h1>Contribution Graph{calendar && ` for ${calendar.name}`}</h1>
        <div className="button-group">
          <button type="button" onClick={reload}>
            Reload
          </button>
          <button type="button" onClick={logout} className="logout-button">
            Log out
          </button>
        </div>
      </header>
      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading-message">Loading contributions...</div>}
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
          <tr key={`week ${week[0].date.toString()}`} className="week">
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

  interface Subdivision {
    key: string;
    style: React.CSSProperties;
  }
  let subdivisions: Subdivision[] = [];
  let style = {};
  if (day.addsUp()) {
    let lightness = 100;
    const count = day.filteredCount(filter);
    if (count) {
      lightness = 45 * (1 - count / max) + 50;
    }
    subdivisions = day.filteredRepos(filter).map((repoDay) => ({
      key: repoDay.url(),
      style: {
        flex: repoDay.count(),
        background: repoDay.repository.color(lightness),
      },
    }));
  } else {
    let lightness = 100;
    const count = day.contributionCount;
    if (count) {
      lightness = 45 * (1 - count / max) + 50;
    }
    className.push("unknown");
    style = {
      background: `hsl(270deg 40 ${lightness.toString()})`,
    };
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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = divRef.current;
    if (!div) return;

    const updatePosition = (e: MouseEvent) => {
      const padding = 10;
      const rect = div.getBoundingClientRect();

      let left = e.clientX + padding;
      let top = e.clientY + padding;

      // Adjust if too far right
      if (left + rect.width > window.innerWidth) {
        left = e.clientX - rect.width - padding;
      }

      // Adjust if too far down
      if (top + rect.height > window.innerHeight) {
        top = e.clientY - rect.height - padding;
      }

      // Ensure it doesn't go off the left edge
      if (left < padding) {
        left = padding;
      }

      // Ensure it doesn't go off the top edge
      if (top < padding) {
        top = padding;
      }

      setPosition({ top, left });
    };

    const parent = div.parentElement;
    if (parent) {
      parent.addEventListener("mousemove", updatePosition);
      return () => parent.removeEventListener("mousemove", updatePosition);
    }
  }, []);

  return (
    <div
      className="day-info"
      ref={divRef}
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <table>
        <tbody>
          {[...day.repositories.values()].map((repoDay) => (
            <tr key={repoDay.repository.url}>
              <td className="commit-count">
                {repoDay.commitCount}
              </td>
              <td className="pr-count">
                {repoDay.prs.length}
              </td>
              <td className="issue-count">
                {repoDay.issues.length}
              </td>
              <td className="review-count">
                {repoDay.reviews.length}
              </td>
              <th>{repoDay.repository.url}</th>
              <td className="created">
                {repoDay.created > 0 && <>(Created)</>}
              </td>
            </tr>
          ))}
          {day.addsUp() ||
            (
              <tr key="unknown">
                <td className="commit-count" colSpan={4}>
                  {(day.contributionCount || 0) - day.knownContributionCount()}
                </td>
                <th>
                  Unknown contributions <span className="unknown">▢</span>
                </th>
                <td className="created"></td>
              </tr>
            )}
        </tbody>
        <tfoot>
          <tr>
            <td className="commit-count" colSpan={4}>
              {day.contributionCount}
            </td>
            <th></th>
            <td className="created"></td>
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
      {[...calendar.repositories.values()].map((repo) => (
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
              checked={filter.isOn(repo.url)}
              value={repo.url}
              onChange={onChange}
            />
            <h3>
              <RepositoryName repo={repo} />
            </h3>
            <WeekGraph repo={repo} calendar={calendar} />
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

function WeekGraph({ calendar, repo }: {
  calendar: Calendar;
  repo: Repository;
}) {
  const weeks = [...calendar.weeks()];
  const weekMax = Math.max(
    ...weeks.map((days) =>
      days.reduce((total, day) => total + (day.contributionCount || 0), 0)
    ),
  );

  return (
    <div className="week-graph">
      {weeks.map((days) => (
        <WeekGraphElement
          key={days[0].date.toString()}
          days={days}
          repo={repo}
          max={weekMax}
        />
      ))}
    </div>
  );
}

function WeekGraphElement({ days, repo, max }: {
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
    height = 5 + 95 * count / max;
  }
  return (
    <div>
      <div style={{ height: `${height.toString()}%` }}></div>
    </div>
  );
}
