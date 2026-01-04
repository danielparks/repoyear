import * as github from "../github/api.ts";
import * as gql from "../github/gql.ts";
import { Repository, RepositorySource } from "./Repository.ts";
import { Day, RepositoryDay } from "./Day.ts";
import { ALL_ON, Filter } from "./Filter.ts";

// 1000 years before and after 1970.
const EPOCH_DAY_MIN = -365000;
const EPOCH_DAY_MAX = 365000;

/**
 * Represents a user’s contribution calendar over a date range.
 *
 * Contains all contributions organized by day and repository.
 */
export class Calendar {
  name: string;
  days: Day[] = [];
  repositories = new Map<string, Repository>();

  constructor(name: string, days: Day[] = []) {
    this.name = name;
    this.updateSummary(days);
  }

  /**
   * Creates a Calendar from GitHub contributions data.
   */
  static fromContributions(...contributions: github.Contributions[]) {
    if (contributions.length == 0) {
      return null;
    }
    const calendar = new Calendar(contributions[0].name);
    for (const contrib of contributions) {
      calendar.updateFromContributions(contrib);
    }
    return calendar;
  }

  /**
   * Merges additional contributions data into this calendar.
   *
   * This is idempotent to handle progressive updates to the calendar. It is run
   * on the entirety of the contributions data each time the query returns
   * another incremental chunk. The work could be de-duplicated at the cost of
   * increased complexity.
   *
   * Returns the number of specific contributions found.
   */
  updateFromContributions(contributions: github.Contributions) {
    const findRepoDay = (timestamp: string, repository: gql.Repository) =>
      // Timestamps (`occurredAt`) are UTC times, e.g. "2025-10-02T07:00:00Z",
      // so parsing with `new Date(str)` works correctly.
      this.repoDay(new Date(timestamp), repository);
    let count = 0;

    if (contributions.calendar) {
      this.updateSummary(
        contributions.calendar.weeks.map((week) =>
          week.contributionDays.map((day) =>
            new Day(parseDateTime(day.date), day.contributionCount)
          )
        ).flat(),
      );
    }

    for (const entry of contributions.commits) {
      const { repository, contributions: { nodes } } = entry;
      for (const node of github.cleanNodes(nodes)) {
        // If GitHub ever returns separate nodes for the same repo/date pair,
        // this will miss some commits. It will show up in the UI as a day not
        // adding up and thus being marked with the “unknown” CSS class. See doc
        // comment about idempotency above.
        findRepoDay(node.occurredAt, repository)?.setCommits(node.commitCount);
        count += node.commitCount;
      }
    }

    for (const { occurredAt, issue } of contributions.issues) {
      findRepoDay(occurredAt, issue.repository)?.issues.add(issue.url);
      count++;
    }

    for (const { occurredAt, pullRequest } of contributions.prs) {
      findRepoDay(occurredAt, pullRequest.repository)?.prs.add(pullRequest.url);
      count++;
    }

    for (const { occurredAt, repository } of contributions.repositories) {
      // If a repo is created twice in one day (I’m not sure that is possible)
      // this code will only record one creation. See doc comment about
      // idempotency above.
      findRepoDay(occurredAt, repository)?.setCreate(1);
      count++;
    }

    for (const { occurredAt, pullRequestReview } of contributions.reviews) {
      findRepoDay(occurredAt, pullRequestReview.repository)?.reviews.add(
        pullRequestReview.url,
      );
      count++;
    }

    this.updateRepoCounts();
    this.updateRepoColors();
    return count;
  }

  /**
   * Update calendar with local contributions.
   */
  updateFromLocal(contributions: Record<string, Date[]>) {
    let firstEpochDay = EPOCH_DAY_MIN, lastEpochDay = EPOCH_DAY_MAX;
    if (this.days[0]) {
      firstEpochDay = toEpochDays(this.days[0].date);
      lastEpochDay = firstEpochDay + this.days.length - 1;
    }

    for (const name in contributions) {
      const repository = this.internRepository({ url: `local:${name}` });
      let previousEpochDay = EPOCH_DAY_MIN, commits = 0;

      // If we recorded data for a day, update it in the calendar.
      const updateDay = () => {
        if (commits > 0) {
          // We've collected data on a day.
          if (firstEpochDay == EPOCH_DAY_MIN) {
            // No existing days.
            firstEpochDay = previousEpochDay;
          }

          this.days[previousEpochDay - firstEpochDay]!.setRepoCommits(
            repository,
            commits,
          );
        }
      };

      for (const date of contributions[name]) {
        const epochDay = toEpochDays(date);
        if (epochDay < firstEpochDay || epochDay > lastEpochDay) {
          continue;
        }

        if (epochDay == previousEpochDay) {
          commits++;
        } else {
          updateDay();
          previousEpochDay = epochDay;
          commits = 1;
        }
      }

      updateDay();
    }

    this.updateRepoCounts();
    this.updateRepoColors();
  }

  /**
   * Calculate the total number of contributions for each repository.
   */
  updateRepoCounts() {
    for (const repo of this.repositories.values()) {
      repo.contributions = 0;
    }

    this.days.forEach((day) => {
      day.repositories.forEach((repoDay) => {
        repoDay.repository.contributions += repoDay.count();
      });
    });
  }

  /**
   * Assigns hues to repos in order of most to least used.
   *
   * This ensures that the most commonly seen repos have distinct hues, since
   * each successive hue is 55° beyond the previous (mod 360°, of course).
   */
  updateRepoColors() {
    let i = 0;
    for (const repo of this.mostUsedRepos()) {
      repo.hue = (285 + 55 * i++) % 360;
    }
  }

  /**
   * Returns all repositories sorted by contribution count (highest first).
   */
  mostUsedRepos(filter = ALL_ON) {
    const repos = this.filteredRepos(filter);
    repos.sort((a, b) => b.contributions - a.contributions);
    return repos;
  }

  /**
   * Get `Repository`s that are enabled by `filter`.
   */
  filteredRepos(filter: Filter) {
    return [...this.repositories.values()].filter((repo) =>
      filter.isOn(repo.url)
    );
  }

  /**
   * Returns all the repository URLs.
   */
  repoUrls() {
    return this.repositories.keys();
  }

  /**
   * Gets the `RepositoryDay` for a given time and repository.
   */
  repoDay(time: Date, repositorySource: RepositorySource) {
    const day = this.day(time);
    const repository = this.internRepository(repositorySource);

    let repoDay = day.repositories.get(repository.url);
    if (!repoDay) {
      repoDay = new RepositoryDay(repository);
      day.repositories.set(repository.url, repoDay);
    }
    return repoDay;
  }

  /**
   * Gets the Day for a given localtime date, creating it if needed.
   *
   * Maintains the invariant that `days[0]` is always a Sunday.
   */
  day(requestedDate: Date): Day {
    // FIXME assumes date is midnight local time.
    const requestedEpochDay = toEpochDays(requestedDate);

    let firstEpochDay = requestedEpochDay;
    if (this.days.length != 0) {
      firstEpochDay = toEpochDays(this.days[0].date);
    }

    // If this.days is empty the following block will handle it.
    const relativeDay = requestedEpochDay - firstEpochDay;
    if (relativeDay >= this.days.length) {
      // endPadding makes sure this.days ends on a Saturday:
      const endPadding = 6 - requestedDate.getDay();
      for (let i = this.days.length - relativeDay; i <= endPadding; i++) {
        this.days.push(new Day(plusDays(requestedDate, i)));
      }
    }

    if (relativeDay >= 0) {
      return this.days[relativeDay];
    }

    // There are existing days, and the requested date is before the first one.
    // Make a prefix array to prepend.

    // Pad prefix to start with Sunday (date - date.getDay())
    const prefix = [];
    for (let i = -requestedDate.getDay(); i < 0; i++) {
      prefix.push(new Day(plusDays(requestedDate, i)));
    }
    const returnDay = new Day(new Date(requestedDate));
    prefix.push(returnDay);

    // Fill gap between date and firstDate.
    const gap = firstEpochDay - requestedEpochDay;
    for (let i = 1; i < gap; i++) {
      prefix.push(new Day(plusDays(requestedDate, i)));
    }

    this.days.unshift(...prefix);
    return returnDay;
  }

  /**
   * Update summary contribution counts or add `Day`s.
   *
   * For existing days, only `contributionCounts` will be changed. For new days,
   * the `Day` object is inserted into the `Calendar`.
   */
  updateSummary(newDays: Day[]) {
    if (newDays.length === 0) {
      return;
    }

    const daysByEpochDay = new Map<number, Day>();
    for (const day of this.days) {
      daysByEpochDay.set(toEpochDays(day.date), day);
    }
    for (const day of newDays) {
      const i = toEpochDays(day.date);
      const oldDay = daysByEpochDay.get(i);
      if (oldDay) {
        oldDay.contributionCount = day.contributionCount;
      } else {
        daysByEpochDay.set(i, day);
      }
    }

    let firstEpochDay = Math.min(...daysByEpochDay.keys());
    let lastEpochDay = Math.max(...daysByEpochDay.keys());
    let firstDate = daysByEpochDay.get(firstEpochDay)!.date;

    // Ensure first day is a Sunday.
    firstEpochDay -= firstDate.getDay();
    firstDate = plusDays(firstDate, -firstDate.getDay());

    // Ensure last day is a Saturday by rounding up interval to multiple of 7.
    const dayCount = Math.ceil((lastEpochDay - firstEpochDay + 1) / 7) * 7;
    lastEpochDay = firstEpochDay + dayCount - 1;

    this.days = [];
    for (let i = firstEpochDay; i <= lastEpochDay; i++) {
      const existingDay = daysByEpochDay.get(i);
      if (existingDay) {
        this.days.push(existingDay);
      } else {
        this.days.push(new Day(plusDays(firstDate, i - firstEpochDay)));
      }
    }
  }

  /**
   * Converts a GraphQL repository into a deduplicated local Repository object.
   */
  internRepository(repositorySource: RepositorySource) {
    const repository = Repository.from(repositorySource);
    const existing = this.repositories.get(repository.url);
    if (existing) {
      return existing;
    }
    this.repositories.set(repository.url, repository);
    return repository;
  }

  /**
   * Get the maximum number of contributions on one day.
   */
  maxContributions() {
    return Math.max(
      ...this.days
        .filter((day) => day.contributionCount !== null)
        .map((day) => day.contributionCount as number),
    );
  }

  /**
   * Yields weeks (7-day arrays) of Days, starting on Sunday.
   */
  *weeks() {
    for (let i = 0; i < this.days.length; i += 7) {
      yield this.days.slice(i, i + 7);
    }
  }
}

/**
 * Parses an ISO date string, e.g. `"2025-01-15T01:23:45Z"`, into a Date object.
 */
function parseDateTime(input: string) {
  const [year, month, ...rest] = input
    .split(/\D+/)
    .map((n) => Number.parseInt(n, 10));
  return new Date(year, month - 1, ...rest);
}

/**
 * Converts a local time `Date` to days since the epoch.
 */
function toEpochDays(input: Date) {
  return Math.round(
    Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()) / 86400000,
  );
}

/**
 * Return a new `Date` that is `days` days after `date`.
 */
function plusDays(date: Date, days: number) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}
