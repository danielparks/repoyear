import { Calendar, Day, Filter, Repository } from "../model/index.ts";

export interface SummaryBoxProps {
  calendar: Calendar;
  selectedDay: Day | null;
}

/**
 * Displays either year summary or day details.
 *
 * When no day is selected, shows top 5 repositories with sparklines.
 * When a day is selected, shows details for that specific day.
 */
export function SummaryBox({ calendar, selectedDay }: SummaryBoxProps) {
  if (selectedDay) {
    return <DaySummary day={selectedDay} />;
  } else {
    return <YearSummary calendar={calendar} />;
  }
}

/**
 * Shows year-level statistics and top repositories.
 */
function YearSummary({ calendar }: { calendar: Calendar }) {
  const topRepos = calendar.mostUsedRepos().slice(0, 5);
  const totalContributions = calendar.days.reduce(
    (total, day) => total + (day.contributionCount || 0),
    0,
  );

  // Get the date range
  const firstDay = calendar.days[0]?.date;
  const lastDay = calendar.days[calendar.days.length - 1]?.date;
  const dateRange = firstDay && lastDay
    ? `${firstDay.toLocaleDateString()} – ${lastDay.toLocaleDateString()}`
    : "";

  return (
    <div className="summary-box">
      <h2>Year Summary</h2>
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-value">{totalContributions}</span>
          <span className="stat-label">Total Contributions</span>
        </div>
        {dateRange && (
          <div className="stat">
            <span className="stat-label">{dateRange}</span>
          </div>
        )}
      </div>
      <h3>Top Repositories</h3>
      <ol className="top-repos">
        {topRepos.map((repo) => (
          <li key={repo.url}>
            <div className="repo-header">
              <a style={{ color: repo.color() }} href={repo.url}>
                {repo.url.replace("https://github.com/", "")}
              </a>
              <span className="contribution-count">{repo.contributions}</span>
            </div>
            <Sparkline repo={repo} calendar={calendar} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Shows details for a specific day.
 */
function DaySummary({ day }: { day: Day }) {
  const totalContributions = day.contributionCount || 0;

  return (
    <div className="summary-box">
      <h2>{day.date.toLocaleDateString()}</h2>
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-value">{totalContributions}</span>
          <span className="stat-label">
            {totalContributions === 1 ? "Contribution" : "Contributions"}
          </span>
        </div>
      </div>
      {day.repositories.size > 0 && (
        <>
          <h3>Repositories</h3>
          <ol className="day-repos">
            {[...day.repositories.values()].map((repoDay) => (
              <li key={repoDay.repository.url}>
                <div className="repo-header">
                  <a
                    style={{ color: repoDay.repository.color() }}
                    href={repoDay.repository.url}
                  >
                    {repoDay.repository.url.replace("https://github.com/", "")}
                  </a>
                  {repoDay.created > 0 && (
                    <span className="repo-badge">Created</span>
                  )}
                </div>
                <div className="repo-details">
                  {repoDay.commitCount > 0 && (
                    <span className="detail-item">
                      {repoDay.commitCount} commit
                      {repoDay.commitCount !== 1 ? "s" : ""}
                    </span>
                  )}
                  {repoDay.prs.size > 0 && (
                    <span className="detail-item">
                      {repoDay.prs.size} PR{repoDay.prs.size !== 1 ? "s" : ""}:
                      {" "}
                      {[...repoDay.prs].map((url, i) => (
                        <>
                          {i > 0 && ", "}
                          <a key={url} href={url}>
                            #{url.split("/").pop()}
                          </a>
                        </>
                      ))}
                    </span>
                  )}
                  {repoDay.issues.size > 0 && (
                    <span className="detail-item">
                      {repoDay.issues.size} issue
                      {repoDay.issues.size !== 1 ? "s" : ""}:{" "}
                      {[...repoDay.issues].map((url, i) => (
                        <>
                          {i > 0 && ", "}
                          <a key={url} href={url}>
                            #{url.split("/").pop()}
                          </a>
                        </>
                      ))}
                    </span>
                  )}
                  {repoDay.reviews.size > 0 && (
                    <span className="detail-item">
                      {repoDay.reviews.size} review
                      {repoDay.reviews.size !== 1 ? "s" : ""}:{" "}
                      {[...repoDay.reviews].map((url, i) => (
                        <>
                          {i > 0 && ", "}
                          <a key={url} href={url}>
                            #{url.split("/").pop()?.replace(
                              "#pullrequestreview-",
                              "",
                            )}
                          </a>
                        </>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      {!day.addsUp() && (
        <p className="unknown-contributions">
          Note: Some contributions ({(day.contributionCount || 0) -
            day.knownContributionCount()}) are from unknown sources.
        </p>
      )}
    </div>
  );
}

/**
 * A mini bar chart showing contribution intensity over time.
 *
 * Divides the calendar into ~25 segments and displays the contribution
 * count for each segment as a vertical bar.
 */
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

/**
 * One of the bars in the mini bar chart.
 */
function SparklineElement({ days, repo, max }: {
  days: Day[];
  repo: Repository;
  max: number;
}) {
  const filter = Filter.withOnlyRepos(repo.url);
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
