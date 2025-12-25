import "./SummaryBox.css";
import { Calendar, Day, Filter, Repository } from "../model/index.ts";
import { RepositoryName } from "./RepositoryList.tsx";
import { Fragment } from "react";

export interface SummaryBoxProps {
  calendar: Calendar;
  filter: Filter;
  selectedDay: Day | null;
}

/**
 * Displays either year summary or day details.
 *
 * When no day is selected, shows top 5 repositories with sparklines.
 * When a day is selected, shows details for that specific day.
 */
export function SummaryBox({ calendar, filter, selectedDay }: SummaryBoxProps) {
  if (selectedDay) {
    return <DaySummary day={selectedDay} filter={filter} />;
  } else {
    return <YearSummary calendar={calendar} filter={filter} />;
  }
}

/**
 * Shows year-level statistics and top repositories.
 *
 * FIXME: filter
 */
function YearSummary(
  { calendar, filter }: { calendar: Calendar; filter: Filter },
) {
  const topRepos = calendar.mostUsedRepos(filter).slice(0, 5);
  const filtered = calendar.repositories.size -
    calendar.filteredRepos(filter).length;

  // Get the date range (FIXME handle partial weeks)
  const firstDay = calendar.days[0]?.date;
  const lastDay = calendar.days[calendar.days.length - 1]?.date;
  const dateRange = firstDay && lastDay
    ? `${firstDay.toLocaleDateString()} – ${lastDay.toLocaleDateString()}`
    : "";

  return (
    <div className="summary-box">
      <h2>{dateRange}</h2>
      {filtered > 0 && (
        <p className="message filtered">
          {countNoun(filtered, "repository")} hidden
        </p>
      )}
      <SummaryStats
        contributions={sum(calendar.days, (day) => day.filteredCount(filter))}
        issues={sum(calendar.days, (day) => day.issueCount(filter))}
        prs={sum(calendar.days, (day) => day.prCount(filter))}
        reviews={sum(calendar.days, (day) => day.reviewCount(filter))}
      />
      <h3>Top Repositories</h3>
      <ol className="top-repos">
        {topRepos.map((repo) => (
          <li key={repo.url}>
            <Sparkline repo={repo} calendar={calendar} />
            <h3>
              <RepositoryName repo={repo} />
              <span className="contribution-count">{repo.contributions}</span>
            </h3>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Shows details for a specific day.
 */
function DaySummary({ day, filter }: { day: Day; filter: Filter }) {
  const repos = day.filteredRepos(filter);
  const filtered = day.repositories.size - repos.length;
  return (
    <div className="summary-box">
      <h2>{day.date.toLocaleDateString()}</h2>
      {filtered > 0 && (
        <p className="message filtered">
          {countNoun(filtered, "repository")} hidden
        </p>
      )}
      <SummaryStats
        contributions={day.filteredCount(filter)}
        issues={day.issueCount(filter)}
        prs={day.prCount(filter)}
        reviews={day.reviewCount(filter)}
      />
      {repos.length > 0 && (
        <>
          <h3>{countNoun(repos.length, "Repository")}</h3>
          <ol className="day-repos">
            {repos.map((repoDay) => (
              <li key={repoDay.repository.url}>
                <h3>
                  <RepositoryName repo={repoDay.repository} />
                  {repoDay.created > 0 && (
                    <span className="repo-badge">Created</span>
                  )}
                </h3>
                <ul>
                  {repoDay.commitCount > 0 && (
                    <li>{countNoun(repoDay.commitCount, "commit")}</li>
                  )}
                  <RepoDayDetail
                    noun="PR"
                    links={makeLinks(
                      repoDay.prs,
                      (url) => `#${url.split("/").pop()}`,
                    )}
                  />
                  <RepoDayDetail
                    noun="issue"
                    links={makeLinks(
                      repoDay.issues,
                      (url) => `#${url.split("/").pop()}`,
                    )}
                  />
                  <RepoDayDetail
                    noun="review"
                    links={makeLinks(
                      repoDay.reviews,
                      (url) => `#${url.split("/").pop()?.replace(/#.*/, "")}`,
                    )}
                  />
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
      {day.unknownCount() > 0 && (
        <p className="message unknown-contributions">
          {countNoun(day.unknownCount(), "contribution")} from unknown sources
        </p>
      )}
    </div>
  );
}

/**
 * Summary statistics — number of contributions, issues, etc.
 */
function SummaryStats(
  { contributions, issues, prs, reviews }: {
    contributions: number;
    issues: number;
    prs: number;
    reviews: number;
  },
) {
  return (
    <table className="stats">
      <tbody>
        <tr>
          <th scope="row">{pluralize("Contribution", contributions)}</th>
          <td>{contributions}</td>
        </tr>
        <tr>
          <th scope="row">{pluralize("Issue", issues)}</th>
          <td>{issues}</td>
        </tr>
        <tr>
          <th scope="row">{pluralize("PR", prs)}</th>
          <td>{prs}</td>
        </tr>
        <tr>
          <th scope="row">{pluralize("Review", reviews)}</th>
          <td>{reviews}</td>
        </tr>
      </tbody>
    </table>
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
    <li>
      {links.length} {links.length == 1 ? noun : plural}:{" "}
      {links.map(([url, text], i) => (
        <Fragment key={url}>
          {i > 0 && ", "}
          <a key={url} href={url}>{text}</a>
        </Fragment>
      ))}
    </li>
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
  return `${count} ${pluralize(noun, count)}`;
}

/**
 * Make a noun plural (very incomplete).
 *
 * If `count == 1`, then this will just return the singular.
 */
function pluralize(singular: string, count = 2) {
  if (count == 1) {
    return singular;
  } else if (singular.endsWith("y")) {
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
