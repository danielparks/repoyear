import { Calendar, Day, Filter, Repository } from "../model/index.ts";
import { RepositoryName } from "./RepositoryList.tsx";
import { Fragment } from "react";

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
  const totalContributions = sum(
    calendar.days,
    (day) => day.contributionCount || 0,
  );
  const totalIssues = sum(calendar.days, (day) => day.issueCount());
  const totalPrs = sum(calendar.days, (day) => day.prCount());
  const totalReviews = sum(calendar.days, (day) => day.reviewCount());

  // Get the date range
  const firstDay = calendar.days[0]?.date;
  const lastDay = calendar.days[calendar.days.length - 1]?.date;
  const dateRange = firstDay && lastDay
    ? `${firstDay.toLocaleDateString()} – ${lastDay.toLocaleDateString()}`
    : "";

  return (
    <div className="summary-box">
      <h2>{dateRange}</h2>
      <div className="summary-stats">
        <div className="stat">
          <span className="stat-value">{totalContributions}</span>
          <span className="stat-label">Contributions</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalIssues}</span>
          <span className="stat-label">Issues</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalPrs}</span>
          <span className="stat-label">PRs</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalReviews}</span>
          <span className="stat-label">PR reviews</span>
        </div>
      </div>
      <h3>Top Repositories</h3>
      <ol className="top-repos">
        {topRepos.map((repo) => (
          <li key={repo.url}>
            <Sparkline repo={repo} calendar={calendar} />
            <div className="repo-label">
              <RepositoryName repo={repo} />
              <span className="contribution-count">{repo.contributions}</span>
            </div>
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
          <h3>
            {countNoun(day.repositories.size, "Repository")}
          </h3>
          <ol className="day-repos">
            {[...day.repositories.values()].map((repoDay) => (
              <li key={repoDay.repository.url}>
                <div className="repo-label">
                  <RepositoryName repo={repoDay.repository} />
                  {repoDay.created > 0 && (
                    <span className="repo-badge">Created</span>
                  )}
                </div>
                <div className="repo-details">
                  {repoDay.commitCount > 0 && (
                    <span className="detail-item">
                      {countNoun(repoDay.commitCount, "commit")}
                    </span>
                  )}
                  <RepoDayDetail
                    noun="PR"
                    links={makeLinks(repoDay.prs, (url) =>
                      `#${url.split("/").pop()}`)}
                  />
                  <RepoDayDetail
                    noun="issue"
                    links={makeLinks(repoDay.issues, (url) =>
                      `#${url.split("/").pop()}`)}
                  />
                  <RepoDayDetail
                    noun="review"
                    links={makeLinks(repoDay.reviews, (url) =>
                      `#${url.split("/").pop()?.replace(/#.*/, "")}`)}
                  />
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
 * A detail in a day’s summary of a repo.
 *
 * `links` is `[url, text][]`.
 */
function RepoDayDetail(
  { noun, plural = pluralize(noun), links }: {
    noun: string;
    plural?: string;
    links: [string, string][];
  },
) {
  if (links.length == 0) {
    return null;
  }

  return (
    <span className="detail-item">
      {links.length} {links.length == 1 ? noun : plural}:{" "}
      {links.map(([url, text], i) => (
        <Fragment key={url}>
          {i > 0 && ", "}
          <a key={url} href={url}>{text}</a>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Sum an array-like.
 */
function sum<T>(
  items: Iterable<T> | ArrayLike<T>,
  getValue: (item: T) => number,
): number {
  return Array.from(items).reduce((total, entry) => total + getValue(entry), 0);
}

/**
 * Convert an array-like of URL strings to `[url, text][]`.
 */
function makeLinks(
  arrayLike: Iterable<string> | ArrayLike<string>,
  converter: (url: string) => string,
): [string, string][] {
  return Array.from(arrayLike).map((url) => [url, converter(url)]);
}

/**
 * Return “count noun(s)”.
 */
function countNoun(count: number, noun: string) {
  if (count == 1) {
    return `${count} ${noun}`;
  } else {
    return `${count} ${pluralize(noun)}`;
  }
}

/**
 * Make a noun plural (very incomplete).
 */
function pluralize(singular: string) {
  if (singular.endsWith("y")) {
    return singular.slice(0, -1) + "ies";
  } else {
    return singular + "s";
  }
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
