import "./App.css";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as github from "./github/api.ts";
import { CONTRIBUTIONS_QUERY_TEMPLATE } from "./github/api.ts";
import { Calendar, Day, Filter, Repository } from "./model.ts";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [authError, setAuthError] = useState<string | null>(null);
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
    isLoading,
    error: queryError,
  } = useQuery({
    enabled: !!accessToken,
    queryKey,
    queryFn: async () => {
      if (!accessToken) {
        // Redundant; enabled condition requires accessToken not to be null.
        throw new Error("Access token is required");
      }

      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      const contributions: github.Contributions[] = [];
      for await (const contribution of gh.queryBase()) {
        contributions.push(contribution);
        // Incrementally update cache, triggering a re-render.
        queryClient.setQueryData(queryKey, [...contributions]);
      }

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

  useEffect(() => {
    if (!calendar) {
      return;
    }

    const newFilter = repoFilter.addReposIfMissing([...calendar.repoUrls()]);
    if (newFilter) {
      setRepoFilter(newFilter);
    }
    // FIXME? does repoFilter in the dependencies cause problems? Not needed.
  }, [calendar, repoFilter]);

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
      <h1>Contribution Graph{calendar && ` for ${calendar.name}`}</h1>
      <button type="button" onClick={logout}>Log out</button>
      {error && <h3 className="error">Error: {error}</h3>}
      {calendar
        ? (
          <>
            <ContributionsGraph calendar={calendar} filter={repoFilter} />
            <RepositoryList
              calendar={calendar}
              filter={repoFilter}
              setFilter={setRepoFilter}
            />
          </>
        )
        : isLoading
        ? <h3 className="loading">Loading</h3>
        : <h3>No contributions data</h3>}
    </>
  );
}

function ContributionsGraph(
  { calendar, filter }: { calendar: Calendar; filter: Filter },
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
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraphDay(
  { day, filter, max }: { day: Day; filter: Filter; max: number },
) {
  let value = 100;
  const count = day.filteredCount(filter);
  if (count) {
    value = 55 * (1 - count / max) + 40;
  }
  const style = {
    background: `hsl(270deg 40 ${value.toString()})`,
  };

  return (
    <td style={style} className={day.addsUp() ? "" : "unknown"}>
      <DayInfo day={day} />
    </td>
  );
}

function DayInfo({ day }: { day: Day }) {
  return (
    <div className="day-info">
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
  { calendar, filter, setFilter }: {
    calendar: Calendar;
    filter: Filter;
    setFilter: React.Dispatch<React.SetStateAction<Filter>>;
  },
) {
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const url = event.currentTarget.value;
    const newFilter = filter.clone();
    newFilter.switchRepo(url, event.currentTarget.checked);
    setFilter(newFilter);
  }
  return (
    <ol>
      {[...calendar.repositories.values()].map((repo) => (
        <li key={repo.url}>
          <label>
            <input
              type="checkbox"
              checked={filter.isOn(repo.url)}
              value={repo.url}
              onChange={onChange}
            />
            <h3>{repo.url}</h3>
            <WeekGraph repo={repo} calendar={calendar} />
          </label>
        </li>
      ))}
    </ol>
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
  const height = 100 * count / max;
  return (
    <div>
      <div style={{ height: `${height.toString()}%` }}></div>
    </div>
  );
}
