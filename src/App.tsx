import "./App.css";
import { useEffect, useState } from "react";
import * as github from "./github/api.ts";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [info, setInfo] = useState<github.Contributions | null>(null);
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

      const token = await github.getToken(code, BACKEND_URL);
      if (token) {
        setAccessToken(token);
        // FIXME? This will be available to the entire origin.
        localStorage.setItem("github_token", token);
        history.replaceState({}, document.title, "/");
      } else {
        setError("Failed to authenticate with GitHub");
      }
    })().catch((error: unknown) => {
      setError("Error during authentication");
      console.error(error);
    });
    // This should only run on mount, not when accessToken changes:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!accessToken) {
        setInfo(null);
        return;
      }
      setLoading(true);

      /*
      contributionsCollection:
        commitContributionsByRepository
        issueContributions or issueContributionsByRepository // opened
        pullRequestContributions or pullRequestContributionsByRepository
        pullRequestReviewContributions or pullRequestReviewContributionsByRepository
        repositoryContributions // repos created
        joinedGitHubContribution
        contributionYears // years the user has made contributions
        hasActivityInThePast // alternative
        mostRecentCollectionWithActivity // maybe automatically gets earlier stuff?
      */
      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      // Load data incrementally.
      let isFirst = true;
      for await (const contributions of gh.queryBase()) {
        setInfo(contributions);
        // Kludge: (await results.next()).value has the wrong type. So:
        if (isFirst) {
          setLoading(false);
          isFirst = false;
        }
      }
    })().catch((error: unknown) => {
      console.error("Error getting contribution data", error);
      setError("Error getting contribution data");
    });
  }, [accessToken]);

  function login(): void {
    try {
      github.redirectToLogin(BASE_URL);
    } catch (error: unknown) {
      console.error("Error redirecting to GitHub login:", error);
      setError("Configuration error. Could not log into GitHub.");
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
      <h1>Contribution Graph{info && ` for ${info.name}`}</h1>
      <button type="button" onClick={logout}>Log out</button>
      {error && <h3 className="error">Error: {error}</h3>}
      {loading
        ? <h3 className="loading">Loading</h3>
        : info
        ? <ContributionsGraph contributions={info} />
        : <h3>No contributions data</h3>}
    </>
  );
}

function parseDateTime(input: string) {
  const [year, month, ...rest] = input
    .split(/\D+/)
    .map((n) => Number.parseInt(n, 10));
  return new Date(year, month - 1, ...rest);
}

// Convert a date time to a date in UTC.
//
// This converts a local date time to its localtime date, then encodes it in UTC
// for simpler date math (UTC has no daylight saving time).
function toUtcDate(input: Date) {
  return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate());
}

class Calendar {
  start: Date;
  start_ms: number; // UTC date encoded as ms since 1970.
  days: Day[];

  constructor(start: Date, days: Day[] = []) {
    this.start = start;
    this.start_ms = toUtcDate(start);
    this.days = days;
  }

  static fromContributions(contributions: github.Contributions) {
    const calendar = new Calendar(
      parseDateTime(contributions.calendar.weeks[0].contributionDays[0].date),
      contributions.calendar.weeks.map((week) =>
        week.contributionDays.map((day) =>
          new Day(parseDateTime(day.date), day.contributionCount)
        )
      ).flat(),
    );

    for (const entry of contributions.commits) {
      const {
        repository: { url, isFork, isPrivate },
        contributions: { nodes, pageInfo },
      } = entry;
      const _ = pageInfo; // FIXME?
      const repository = new Repository(url, isFork, isPrivate);
      for (const node of github.cleanNodes(nodes)) {
        const { commitCount, occurredAt, isRestricted } = node;
        const _ = isRestricted; // FIXME?
        // occurredAt seems to be a localtime date explicitly in UTC, e.g.
        // "2025-10-02T07:00:00Z", so using `new Date()` to parse it works well.
        const day = calendar.day(new Date(occurredAt));
        if (!day) {
          console.warn(`Date "${occurredAt}" not in calendar`);
        } else {
          const repoDay = day.repositories.get(url);
          if (repoDay) {
            repoDay.commitCount += commitCount; // FIXME correct?
          } else {
            day.repositories.set(
              url,
              new RepositoryDay(repository, commitCount),
            );
          }
        }
      }
    }

    for (const node of contributions.issues) {
      const { url, isFork, isPrivate } = node.issue.repository;

      // occurredAt seems to be a UTC datetime, e.g. "2025-11-06T21:41:51Z", so
      // using `new Date()` to parse it works well.
      const day = calendar.day(new Date(node.occurredAt));
      if (!day) {
        console.warn(`Date "${node.occurredAt}" not in calendar`);
      } else {
        const repoDay = day.repositories.get(url);
        if (repoDay) {
          repoDay.prs.push(node.issue.url);
        } else {
          const repository = new Repository(url, isFork, isPrivate);
          const repoDay = new RepositoryDay(repository, 0, 0);
          repoDay.issues.push(node.issue.url);
          day.repositories.set(url, repoDay);
        }
      }
    }

    for (const node of contributions.prs) {
      const { url, isFork, isPrivate } = node.pullRequest.repository;

      // occurredAt seems to be a UTC datetime, e.g. "2025-11-06T21:41:51Z", so
      // using `new Date()` to parse it works well.
      const day = calendar.day(new Date(node.occurredAt));
      if (!day) {
        console.warn(`Date "${node.occurredAt}" not in calendar`);
      } else {
        const repoDay = day.repositories.get(url);
        if (repoDay) {
          repoDay.prs.push(node.pullRequest.url);
        } else {
          const repository = new Repository(url, isFork, isPrivate);
          const repoDay = new RepositoryDay(repository, 0, 0);
          repoDay.prs.push(node.pullRequest.url);
          day.repositories.set(url, repoDay);
        }
      }
    }

    for (const node of contributions.repositories) {
      const {
        isRestricted,
        occurredAt,
        repository: { url, isFork, isPrivate },
      } = node;
      const _ = isRestricted; // FIXME?
      const repository = new Repository(url, isFork, isPrivate);

      // occurredAt seems to be a UTC datetime, e.g. "2025-11-06T21:41:51Z", so
      // using `new Date()` to parse it works well.
      const day = calendar.day(new Date(occurredAt));
      if (!day) {
        console.warn(`Date "${occurredAt}" not in calendar`);
      } else {
        const repoDay = day.repositories.get(url);
        if (repoDay) {
          repoDay.created++;
        } else {
          day.repositories.set(url, new RepositoryDay(repository, 0, 1));
        }
      }
    }

    return calendar;
  }

  // Expects localtime date.
  day(date: Date): Day | undefined {
    // FIXME doens’t handle out-of-range dates well.
    return this.days[Math.round((toUtcDate(date) - this.start_ms) / 86400000)];
  }

  maxContributions() {
    return Math.max(
      ...this.days
        .filter((day) => day.contributionCount !== null)
        .map((day) => day.contributionCount as number),
    );
  }

  // FIXME test this.
  *weeks() {
    // Weeks always start on Sunday; if .start isn’t Sunday, pad with null Days.
    const firstWeek: Day[] = [];
    const date = new Date(this.start);
    for (let i = 0; i < this.start.getDay(); i++) {
      firstWeek.push(new Day(date, null));
      date.setDate(date.getDate() + 1);
    }
    firstWeek.push(...this.days.slice(0, 7 - this.start.getDay()));
    yield firstWeek;

    for (let i = 7 - this.start.getDay(); i < this.days.length; i += 7) {
      yield this.days.slice(i, i + 7);
    }
  }
}

class Day {
  date: Date;
  contributionCount: number | null;
  repositories: Map<string, RepositoryDay>;

  constructor(
    date: Date,
    contributionCount: number | null = null,
    repositories: Map<string, RepositoryDay> = new Map(),
  ) {
    this.date = date;
    this.contributionCount = contributionCount;
    this.repositories = repositories;
  }

  // Do the contributions we know about add up to the contribution count?
  addsUp() {
    return this.contributionCount == this.knownContributionCount();
  }

  // Add up the contributions we know about specifically.
  knownContributionCount() {
    return [...this.repositories.values()].reduce(
      (total, repoDay) =>
        total + repoDay.created + repoDay.commitCount + repoDay.issues.length +
        repoDay.prs.length,
      0,
    );
  }
}

class RepositoryDay {
  readonly repository: Repository;
  commitCount: number;
  // How many times the repo was created this day. (Typically 0, sometimes 1.)
  created = 0;
  // Issue urls
  issues: string[];
  // PR urls
  prs: string[];

  constructor(
    repository: Repository,
    commitCount = 0,
    created = 0,
  ) {
    this.repository = repository;
    this.commitCount = commitCount;
    this.created = created;
    this.issues = [];
    this.prs = [];
  }
}

class Repository {
  url: string;
  isFork: boolean;
  isPrivate: boolean;
  constructor(url: string, isFork = false, isPrivate = false) {
    this.url = url;
    this.isFork = isFork;
    this.isPrivate = isPrivate;
  }
}

function ContributionsGraph(
  { contributions }: { contributions: github.Contributions },
) {
  const calendar = Calendar.fromContributions(contributions);
  const dayMax = calendar.maxContributions();

  function dayStyle(day: Day) {
    let value = 100;
    if (day.contributionCount) {
      value = 55 * (1 - day.contributionCount / dayMax) + 40;
    }
    return {
      background: `hsl(270deg 40 ${value.toString()})`,
    };
  }

  return (
    <>
      <table className="contributions">
        <tbody>
          {[...calendar.weeks()].map((week) => (
            <tr key={`week ${week[0].date.toString()}`} className="week">
              {week.map((day) => (
                <td
                  key={`day ${day.date.toString()}`}
                  style={dayStyle(day)}
                  className={day.addsUp() ? "" : "unknown"}
                >
                  <DayInfo day={day} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Repository commits</h2>
      <ol>
        {contributions.commits.map(({ repository, contributions }, i) => (
          <li key={`commits for ${repository.url} ${i.toString()}`}>
            <h3>
              {repository.url}: {github.cleanNodes(contributions.nodes).length}
              {contributions.pageInfo.hasNextPage &&
                `+ (${contributions.pageInfo.endCursor || ""})`}
            </h3>
            <ol>
              {github.cleanNodes(contributions.nodes).map((node) => (
                <li key={node.occurredAt}>{JSON.stringify(node)}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <h2>Issues</h2>
      <ol>
        {contributions.issues.map(
          (node) => (
            <li key={`${node.occurredAt} ${node.issue.url}`}>
              {node.occurredAt} {node.issue.url}
            </li>
          ),
        )}
      </ol>

      <h2>Pull requests</h2>
      <ol>
        {contributions.prs.map(
          (node) => (
            <li key={`${node.occurredAt} ${node.pullRequest.url}`}>
              {node.occurredAt} {node.pullRequest.url}
            </li>
          ),
        )}
      </ol>

      <h2>Repositories created</h2>
      <ol>
        {contributions.repositories.map(
          (node) => (
            <li key={`${node.occurredAt} ${node.repository.url}`}>
              {node.occurredAt} {node.repository.url}
            </li>
          ),
        )}
      </ol>
    </>
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
              <th>{repoDay.repository.url}</th>
              <td className="created">
                {repoDay.created > 0 && <>(Created)</>}
              </td>
            </tr>
          ))}
          {day.addsUp() ||
            (
              <tr key="unknown">
                <td className="commit-count" colSpan={3}>
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
            <td className="commit-count" colSpan={3}>
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
