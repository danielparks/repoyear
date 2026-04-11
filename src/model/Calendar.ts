import * as github from "../github/api.ts";
import * as gql from "../github/gql.ts";
import { Repository, RepositorySource } from "./Repository.ts";
import {
  Day,
  EPOCH_DAY_MAX,
  EPOCH_DAY_MIN,
  RepositoryDay,
  toEpochDays,
} from "./Day.ts";
import { ALL_ON, Filter } from "./Filter.ts";

/**
 * Represents a user’s contribution calendar over a date range.
 *
 * Contains all contributions organized by day and repository.
 */
export class Calendar {
  name: string;
  days: Day[] = [];
  repositories = new Map<string, Repository>();
  gitHubSpecificCount: number | undefined;

  constructor(name: string, days: Day[] = []) {
    this.name = name;
    // FIXME this path is now only really used by tests:
    this.normalizeDays(days);
  }

  /**
   * Create a new calendar object with days set to include `endDate` and `years`
   * years previous to that.
   */
  static fromYears(name: string, endDate: Date, years: number = 1) {
    // This should always generate 53 weeks for 1 year and 105 for 2. This needs
    // to calculate with dates rather than just days to account for leap years.
    const lastSaturday = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate() + 6 - endDate.getDay(),
    );
    const firstSunday = new Date(
      lastSaturday.getFullYear() - years,
      lastSaturday.getMonth(),
      lastSaturday.getDate(),
    );
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

    // No need to run normalizeDays():
    const calendar = new Calendar(name);
    calendar.days = Array.from(
      { length: 1 + toEpochDays(lastSaturday) - toEpochDays(firstSunday) },
      (_, i) =>
        new Day(
          new Date(
            firstSunday.getFullYear(),
            firstSunday.getMonth(),
            firstSunday.getDate() + i,
          ),
        ),
    );
    return calendar;
  }

  /**
   * Creates a Calendar from GitHub and/or local contributions data.
   */
  static fromContributions(
    { gitHub = [], local = [], endDate = new Date(), years = 1 }: {
      gitHub?: github.Contributions[];
      local?: Record<string, number[]>[];
      endDate?: Date;
      years?: number;
    },
  ): Calendar {
    const calendar = Calendar.fromYears(gitHub[0]?.name || "", endDate, years);
    for (const contrib of local) {
      calendar.updateFromLocal(contrib);
    }
    for (const contrib of gitHub) {
      calendar.updateFromGitHub(contrib);
    }
    calendar.updateRepoCounts();
    calendar.updateRepoColors();
    return calendar;
  }

  /**
   * Merges additional contributions data into this calendar.
   *
   * If there is summary data in a chunk, then that chunk is assumed to be the
   * first chunk in a sequence, and all specific contributions are reset.
   *
   * Chunks without summary data will only update already existing days.
   *
   * This is not idempotent; it must not be run on the same chunk twice. It may
   * be run after updateRepoCounts() and/or updateRepoColors().
   */
  updateFromGitHub(contributions: github.Contributions) {
    const findRepoDay = (timestamp: string, repository: gql.Repository) =>
      // Timestamps (`occurredAt`) are UTC times, e.g. "2025-10-02T07:00:00Z",
      // so parsing with `new Date(str)` works correctly.
      this.existingRepoDay(new Date(timestamp), repository);
    this.gitHubSpecificCount ??= 0;

    if (contributions.calendar) {
      // Clear specific contributions for all days in this year's summary range
      // before re-adding them. This ensures that contributions deleted between
      // reloads are removed when reprocessing.
      const { weeks } = contributions.calendar;
      const firstDate = weeks[0]?.contributionDays[0]?.date;
      const lastDate = weeks.at(-1)?.contributionDays.at(-1)?.date;
      if (firstDate && lastDate) {
        const fromEpochDay = toEpochDays(parseDateTime(firstDate));
        const toEpochDay = toEpochDays(parseDateTime(lastDate));
        for (const day of this.days) {
          const epochDay = day.epochDay();
          if (epochDay >= fromEpochDay && epochDay <= toEpochDay) {
            for (const repoDay of day.repositories.values()) {
              repoDay.setCommits(0);
              repoDay.setCreate(0);
              repoDay.issues.clear();
              repoDay.prs.clear();
              repoDay.reviews.clear();
            }
          }
        }
      }

      this.normalizeDays(
        weeks.map((week) =>
          week.contributionDays.map((day) =>
            new Day(parseDateTime(day.date), day.contributionCount)
          )
        ).flat(),
      );
    }

    for (const entry of contributions.commits) {
      const { repository, contributions: { nodes } } = entry;
      for (const node of github.cleanNodes(nodes)) {
        // Using addCommits rather than setCommits in case GitHub ever returns
        // multiple nodes for the same repo/date pair in one response.
        const repoDay = findRepoDay(node.occurredAt, repository);
        if (repoDay) {
          repoDay.addCommits(node.commitCount);
          this.gitHubSpecificCount += node.commitCount;
        }
      }
    }

    for (const { occurredAt, issue } of contributions.issues) {
      const repoDay = findRepoDay(occurredAt, issue.repository);
      if (repoDay) {
        repoDay.issues.add(issue.url);
        this.gitHubSpecificCount++;
      }
    }

    for (const { occurredAt, pullRequest } of contributions.prs) {
      const repoDay = findRepoDay(occurredAt, pullRequest.repository);
      if (repoDay) {
        repoDay.prs.add(pullRequest.url);
        this.gitHubSpecificCount++;
      }
    }

    for (const { occurredAt, repository } of contributions.repositories) {
      const repoDay = findRepoDay(occurredAt, repository);
      if (repoDay) {
        repoDay.addCreate();
        this.gitHubSpecificCount++;
      }
    }

    for (const { occurredAt, pullRequestReview } of contributions.reviews) {
      const repoDay = findRepoDay(occurredAt, pullRequestReview.repository);
      if (repoDay) {
        repoDay.reviews.add(pullRequestReview.url);
        this.gitHubSpecificCount++;
      }
    }
  }

  /**
   * Update calendar with local contributions.
   */
  updateFromLocal(contributions: Record<string, number[]>) {
    let firstEpochDay = EPOCH_DAY_MIN, lastEpochDay = EPOCH_DAY_MAX;
    if (this.days[0]) {
      firstEpochDay = this.days[0].epochDay();
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

      for (const seconds of contributions[name]) {
        const epochDay = toEpochDays(new Date(seconds * 1000));
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
  }

  /**
   * Calculate the total number of contributions for each repository.
   */
  updateRepoCounts() {
    let unknownTotal = 0;

    for (const repo of this.repositories.values()) {
      repo.contributions = 0;
    }

    this.days.forEach((day) => {
      let dayTotal = 0;
      day.repositories.forEach((repoDay) => {
        if (repoDay.repository.url != "unknown") {
          const count = repoDay.count();
          dayTotal += count;
          repoDay.repository.contributions += count;
        }
      });

      const unknownCount = (day.contributionCount || 0) - dayTotal;
      if (unknownCount > 0) {
        unknownTotal += unknownCount;
        day.setRepoCommits(this.internRepository("unknown"), unknownCount);
      } else {
        day.repositories.delete("unknown");
      }
    });

    const unknownRepo = this.repositories.get("unknown");
    if (unknownRepo) {
      unknownRepo.contributions = unknownTotal;
    }
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
  mostUsedRepos(filter = ALL_ON): Repository[] {
    const repos = this.filteredRepos(filter);
    repos.sort((a, b) => b.contributions - a.contributions);
    return repos;
  }

  /**
   * Get `Repository`s that are enabled by `filter`.
   */
  filteredRepos(filter: Filter): Repository[] {
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
   * Gets the `RepositoryDay` for a given time and repository, creating the day
   * if it doesn't exist.
   */
  repoDay(time: Date, repositorySource: RepositorySource): RepositoryDay {
    return this.repoDayForDay(this.day(time), repositorySource);
  }

  /**
   * Gets the `RepositoryDay` for a given time and repository, or `null` if
   * the date falls outside the calendar's current range.
   *
   * Unlike `repoDay()`, this never creates new days. Use this for specific
   * event data (commits, issues, etc.) so that events outside the summary
   * date range are silently dropped rather than extending the calendar.
   */
  existingRepoDay(
    time: Date,
    repositorySource: RepositorySource,
  ): RepositoryDay | null {
    const day = this.days[this.epochDayToIndex(toEpochDays(time)) ?? -1];
    if (!day) {
      return null;
    }
    return this.repoDayForDay(day, repositorySource);
  }

  /**
   * Get the `RepositoryDay` for a given `Day` and repo.
   */
  repoDayForDay(day: Day, repositorySource: RepositorySource): RepositoryDay {
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
      firstEpochDay = this.days[0].epochDay();
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
   * Ensure `Day`s are contiguous and summary counts are up-to-date.
   *
   * For existing days, only `contributionCounts` will be changed. For new days,
   * the `Day` object is inserted into the `Calendar`.
   */
  normalizeDays(newDays: Day[]) {
    if (newDays.length === 0) {
      return;
    }

    const daysByEpochDay = new Map<number, Day>();
    for (const day of this.days) {
      daysByEpochDay.set(day.epochDay(), day);
    }
    for (const day of newDays) {
      const i = day.epochDay();
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
    return Math.max(...this.days.map((day) => day.filteredCount(ALL_ON)));
  }

  /**
   * Get the days array with days with no data trimmed from both ends.
   */
  trimmedDays(): Day[] {
    const first = this.days.findIndex((day) => day.hasData());
    if (first == -1) {
      return [];
    }
    return this.days.slice(
      first,
      this.days.findLastIndex((day) => day.hasData()),
    );
  }

  /**
   * Convert `Day` to `this.days` index.
   */
  dayToIndex(day: Day): number {
    const index = this.epochDayToIndex(day.epochDay());
    if (index === undefined) {
      throw new Error("Day object not in calendar");
    }
    return index;
  }

  /**
   * Convert epoch day to `this.days` index.
   */
  epochDayToIndex(epochDay: number): number | undefined {
    const reference = this.days[0]?.epochDay();
    if (reference === undefined) {
      return undefined;
    } else {
      return epochDay - reference;
    }
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
 * Return a new `Date` that is `days` days after `date`.
 */
function plusDays(date: Date, days: number) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}
