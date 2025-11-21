import "./App.css";
import { useEffect, useState } from "react";
import * as github from "./github/api.ts";
import type { CreatedCommitContribution } from "./github/gql.ts";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [info, setInfo] = useState<github.Contributions | null>(null);
  const [loading, setLoading] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
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
      setInfo(await gh.queryBase());
      setLoading(false);
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
      <h1>Contribution Graph{info && " for " + info.name}</h1>
      <button type="button" onClick={logout}>Log out</button>
      {error && <h3 className="error">Error: {error}</h3>}
      {loading ? <h3 className="loading">Loading</h3> : info
        ? (
          <>
            <label>
              <input
                type="checkbox"
                onChange={(e) => {
                  setShowNumbers(e.target.checked);
                }}
              />{" "}
              Show numbers
            </label>
            <ContributionsGraph
              contributions={info}
              showNumbers={showNumbers}
            />
          </>
        )
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
      if (nodes) {
        for (const node of nodes) {
          const { commitCount, occurredAt, isRestricted } =
            node as CreatedCommitContribution;
          const _ = isRestricted; // FIXME?
          // occurredAt seems to always be a localtime date explicitly in UTC,
          // e.g. "2025-10-02T07:00:00Z", so using `new Date()` to parse it
          // works well.
          const day = calendar.day(new Date(occurredAt));
          if (!day) {
            console.warn(`Date "${occurredAt}" not in calendar`);
          } else {
            // FIXME find existing RepositoryDay and update it if appropriate?
            day.repositories.push(new RepositoryDay(repository, commitCount));
          }
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
  repositories: RepositoryDay[] = [];

  constructor(
    date: Date,
    contributionCount: number | null = null,
    repositories: RepositoryDay[] = [],
  ) {
    this.date = date;
    this.contributionCount = contributionCount;
    this.repositories = repositories;
  }
}

class RepositoryDay {
  readonly repository: Repository;
  commitCount: number;
  // How many times the repo was created this day. (Typically 0, sometimes 1.)
  created = 0;
  constructor(repository: Repository, commitCount = 0, created = 0) {
    this.repository = repository;
    this.commitCount = commitCount;
    this.created = created;
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
  { contributions, showNumbers }: {
    contributions: github.Contributions;
    showNumbers: boolean;
  },
) {
  const calendar = Calendar.fromContributions(contributions);
  const dayMax = calendar.maxContributions();

  function dayStyle(day: Day) {
    let value = 100;
    let color = "transparent";
    if (day.contributionCount) {
      value = 55 * (1 - day.contributionCount / dayMax) + 40;
      if (showNumbers) {
        color = value < 70 ? "#fff" : "#333";
      }
    }
    return {
      color,
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
                >
                  {day.contributionCount}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <pre>{JSON.stringify(contributions.commits, null, 2)}</pre>
      <pre>{JSON.stringify(contributions.repositories, null, 2)}</pre>
    </>
  );
}
