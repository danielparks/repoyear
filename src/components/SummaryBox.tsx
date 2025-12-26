import "./SummaryBox.css";
import { Calendar, Day, Filter, Repository } from "../model/index.ts";
import { RepositoryName } from "./RepositoryList.tsx";
import { Fragment } from "react";
import { chunk, countNoun, pluralize, sum } from "../util.ts";

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

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Shows year-level statistics and top repositories.
 */
function YearSummary(
  { calendar, filter }: { calendar: Calendar; filter: Filter },
) {
  const topRepos = calendar.mostUsedRepos(filter).slice(0, 6);
  const filtered = calendar.repositories.size -
    calendar.filteredRepos(filter).length;

  // Get the date range (FIXME handle partial weeks)
  const firstDay = calendar.days[0]?.date;
  const lastDay = calendar.days[calendar.days.length - 1]?.date;
  const dateRange = firstDay && lastDay
    ? `${DATE_FORMATTER.format(firstDay)} – ${DATE_FORMATTER.format(lastDay)}`
    : "";

  // Segment contributions for each repo for sparklines.
  interface RepoCounts {
    repo: Repository;
    counts: number[];
  }
  const topRepoCounts: RepoCounts[] = topRepos.map(
    (repo) => {
      const filter = Filter.withOnlyRepos(repo.url);
      const counts = chunk(calendar.days, 50).map((days) =>
        sum(days, (day) => day.filteredCount(filter))
      );
      return { repo, counts };
    },
  );

  // Max contributions from any segment.
  const max = Math.max(
    ...topRepoCounts.map(({ counts }) => Math.max(...counts)),
  );

  // Convert segments from absolute counts to fraction of maximum.
  interface RepoValues {
    repo: Repository;
    values: number[];
  }
  const topRepoValues: RepoValues[] = topRepoCounts.map(
    ({ repo, counts }) => ({
      repo,
      values: counts.map((count) => count / max),
    }),
  );

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
        {topRepoValues.map(({ repo, values }) => (
          <li key={repo.url}>
            <h4>
              <RepositoryName repo={repo} />
              <span className="contribution-count">{repo.contributions}</span>
            </h4>
            <Sparkline values={values} color={repo.color()} />
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
      <h2>{DATE_FORMATTER.format(day.date)}</h2>
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
  const points = values.map((value, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - value * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height + 1}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
