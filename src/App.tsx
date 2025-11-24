import "./App.css";
import { useEffect, useState } from "react";
import * as github from "./github/api.ts";
import { Calendar, Day } from "./model.ts";

const BASE_URL = "http://localhost:5173";
const BACKEND_URL = "http://localhost:3000";

export default function App() {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem("github_token"),
  );
  const [info, setInfo] = useState<Calendar | null>(null);
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

      const gh = new github.GitHub(accessToken);
      gh.installRateLimitReport();

      // Load data incrementally.
      let calendar: Calendar | null = null;
      for await (const contributions of gh.queryBase()) {
        // Kludge: (await results.next()).value has the wrong type. So:
        if (calendar) {
          calendar.updateFromContributions(contributions);
          setInfo(calendar);
        } else {
          // First loop.
          calendar = Calendar.fromContributions(contributions);
          setInfo(calendar);
          setLoading(false);
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
        ? <ContributionsGraph calendar={info} />
        : <h3>No contributions data</h3>}
    </>
  );
}

function ContributionsGraph({ calendar }: { calendar: Calendar }) {
  const dayMax = calendar.maxContributions();

  return (
    <table className="contributions">
      <tbody>
        {[...calendar.weeks()].map((week) => (
          <tr key={`week ${week[0].date.toString()}`} className="week">
            {week.map((day) => (
              <GraphDay key={day.date.toString()} day={day} max={dayMax} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraphDay({ day, max }: { day: Day; max: number }) {
  let value = 100;
  if (day.contributionCount) {
    value = 55 * (1 - day.contributionCount / max) + 40;
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
