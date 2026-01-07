import "./SummaryBox.css";
import { Calendar, Day, Filter, Repository } from "../model/index.ts";
import { RepositoryName } from "./RepositoryList.tsx";
import { Fragment } from "react";
import { chunk, countNoun, pluralize, sum } from "../util.ts";

export interface SummaryBoxProps {
  calendar: Calendar;
  filter: Filter;
  selectedDays: Set<Day>;
}

/**
 * Displays either multiday summary or day details.
 *
 *   * If nothing is selected, shows a summary of all available data, including
 *     sparklines for the repos with the most contributions.
 *   * If multiple days are selected, shows a summary of those days.
 *   * If a single day is selected, shows the contributions on that day.
 */
export function SummaryBox(
  { calendar, filter, selectedDays }: SummaryBoxProps,
) {
  if (selectedDays.size === 1) {
    return <DaySummary day={[...selectedDays][0]} filter={filter} />;
  } else if (selectedDays.size > 1) {
    return (
      <MultidaySummary
        days={[...selectedDays].sort((a, b) =>
          a.date.getTime() - b.date.getTime()
        )}
        filter={filter}
      />
    );
  } else {
    return (
      <MultidaySummary
        days={calendar.trimmedDays()}
        filter={filter}
        mostUsedReposHint={calendar.mostUsedRepos(filter)}
      />
    );
  }
}

/**
 * Shows summary statistics for multiple selected days.
 *
 * `calendar.mostUsedRepos()` doesn't return counts for each day, so we just use
 * it to filter our later calculations that do produce daily counts.
 */
function MultidaySummary(
  { days, filter, mostUsedReposHint }: {
    days: Day[];
    filter: Filter;
    mostUsedReposHint?: Repository[];
  },
) {
  let topRepoFilter = filter;
  if (mostUsedReposHint) {
    topRepoFilter = Filter.withOnlyRepos(
      ...mostUsedReposHint.slice(0, 6).map((repo) => repo.url),
    );
  }
  const topRepoCounts = findTopRepos(days, topRepoFilter);

  let title = "";
  if (days.length > 0) {
    const firstDate = formatDate(days[0].date);
    if (days.length == 1) {
      title = formatDate(days[0].date);
    } else {
      const lastDate = formatDate(days[days.length - 1].date);
      if (topRepoCounts[0]?.counts.some(isNaN)) {
        title = `${firstDate}… ${lastDate}`;
      } else {
        title = `${firstDate} — ${lastDate}`;
      }
    }
  }

  let shownCount = topRepoCounts.length;
  if (mostUsedReposHint) {
    // topRepoCounts is limited to the top 6, so we can’t use it.
    shownCount = mostUsedReposHint.length;
  }

  // Count all the repositories (unfiltered) with contributions on these days.
  const totalRepoCount = new Set(
    days.flatMap((day) =>
      [...day.repositories.values()].map((repoDay) => repoDay.repository)
    ),
  ).size;
  const hiddenCount = totalRepoCount - shownCount;

  // Segment contributions for each repo for sparklines.
  const topReposChunked = topRepoCounts.slice(0, 6).map(
    (repoCounts) => {
      repoCounts.counts = chunk(repoCounts.counts, 50).map((chunk) => {
        if (chunk.every(isNaN)) {
          return NaN;
        } else {
          // NaN || 0 = 0
          return sum(chunk, (n) => n || 0);
        }
      });
      return repoCounts;
    },
  );

  // Max contributions from any segment.
  const max = Math.max(
    ...topReposChunked.map(({ counts }) =>
      Math.max(0, ...counts.filter((n) => !isNaN(n)))
    ),
  );

  return (
    <div className="summary-box">
      <h2>{title}</h2>

      {hiddenCount > 0 && (
        <p className="message filtered">
          {countNoun(hiddenCount, "repository")} hidden
        </p>
      )}

      <SummaryStats
        contributions={sum(days, (day) => day.filteredCount(filter))}
        issues={sum(days, (day) => day.issueCount(filter))}
        prs={sum(days, (day) => day.prCount(filter))}
        reviews={sum(days, (day) => day.reviewCount(filter))}
      />

      <h3>Top Repositories</h3>
      <ol className="top-repos">
        {topReposChunked.map(({ repo, counts, total }) => (
          <li key={repo.url}>
            <h4>
              <RepositoryName repo={repo} />
              <span className="contribution-count">{total}</span>
            </h4>
            <Sparkline
              values={counts.map((count) => count / max)}
              color={repo.color()}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

interface RepoCounts {
  repo: Repository;
  counts: number[];
  total: number;
}

/**
 * Find repos with most contributions for these days and this filter.
 *
 * Returns each repo’s contribution count for each day.
 */
function findTopRepos(days: Day[], filter: Filter): RepoCounts[] {
  const repoCounts = new Map<Repository, number[]>();

  if (days.length == 0) {
    return [];
  }

  // We want counts to have 0 for no contributions on a day, and NaN if the day
  // is not included in the selection.
  const firstEpochDay = days[0].epochDay();
  const template: number[] = [];
  for (const day of days) {
    template[day.epochDay() - firstEpochDay] = 0;
  }

  for (const day of days) {
    for (const repoDay of day.filteredRepos(filter)) {
      let dayCounts = repoCounts.get(repoDay.repository);
      if (dayCounts === undefined) {
        dayCounts = [...template];
        repoCounts.set(repoDay.repository, dayCounts);
      }

      dayCounts[day.epochDay() - firstEpochDay] = repoDay.count();
    }
  }

  return Array.from(repoCounts.entries())
    .map(([repo, counts]) => ({
      repo,
      counts,
      total: sum(counts, (n) => n || 0),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Shows details for a specific day.
 */
function DaySummary({ day, filter }: { day: Day; filter: Filter }) {
  const repos = day.filteredRepos(filter);
  const filtered = day.repositories.size - repos.length;
  return (
    <div className="summary-box">
      <h2>{formatDate(day.date)}</h2>
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
                <h4>
                  <RepositoryName repo={repoDay.repository} />
                  {repoDay.created > 0 && (
                    <span className="repo-badge">Created</span>
                  )}
                </h4>
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

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Format date with `DATE_FORMATTER` (for convenience).
 */
function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
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
 * Convert an array-like of URL strings to `[url, text][]`.
 */
function makeLinks(
  arrayLike: Iterable<string> | ArrayLike<string>,
  converter: (url: string) => string,
): [string, string][] {
  return Array.from(arrayLike).sort().map((url) => [url, converter(url)]);
}

/**
 * A sparkline showing contribution intensity over time.
 *
 * Divides the calendar into 50 segments and displays the contribution
 * count for each segment as a connected line graph.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const width = 100;
  const height = 19; // Actually 20, but a stroke at 20 gets clipped in half.

  // Split the data on NaN
  const lines: [number, number][][] = [];
  let current: [number, number][] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (isNaN(value)) {
      if (current.length > 0) {
        lines.push(current);
        current = [];
      }
      continue;
    }
    current.push([i, value]);
  }

  if (current.length > 0) {
    lines.push(current);
  }

  function lineToPoints(line: [number, number][]): string {
    if (line.length == 1) {
      const [i, value] = line[0];
      const x1 = Math.max(0, ((i - 0.2) / (values.length - 1)) * width);
      const x2 = Math.min(width, ((i + 0.2) / (values.length - 1)) * width);
      const y = height - value * height;
      return `${x1},${y} ${x2},${y}`;
    } else {
      return line.map(([i, value]) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - value * height;
        return `${x},${y}`;
      }).join(" ");
    }
  }

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height + 1}`}
      preserveAspectRatio="none"
    >
      {lines.map((line, i) => (
        <polyline
          key={i.toString()}
          points={lineToPoints(line)}
          fill="none"
          stroke={color}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
