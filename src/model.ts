import * as github from "./github/api.ts";
import * as gql from "./github/gql.ts";

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
 * Manages which repositories are visible in the contribution graph.
 *
 * Maintains a default state (all on/off) and per-repository overrides.
 */
export class Filter {
  defaultState: boolean = true;
  states: Map<string, boolean> = new Map();

  /**
   * Creates a filter that only shows the specified repositories.
   */
  static withOnlyRepos(...urls: string[]) {
    const filter = new Filter();
    filter.defaultState = false;
    urls.forEach((url) => {
      filter.states.set(url, true);
    });
    return filter;
  }

  /**
   * Checks whether a repository should be visible.
   */
  isOn(url: string): boolean {
    const value = this.states.get(url);
    if (value === undefined) {
      return this.defaultState;
    } else {
      return value;
    }
  }

  /**
   * Clone this object.
   */
  clone() {
    const filter = new Filter();
    filter.defaultState = this.defaultState;
    filter.states = new Map(this.states);
    return filter;
  }

  /**
   * Enable or disable a repo by its URL.
   */
  switchRepo(url: string, enabled: boolean) {
    this.states.set(url, enabled);
  }
}

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
   * This is idempotent to handle progressive updates to the calendar. It will
   * be run on the same contributions data multiple times during progressive
   * loading. The work could be de-duplicated at the cost of increased
   * complexity and possibly a chance of missing data, depending on whether or
   * not `useMemo()` always triggers on changes (even very rapid ones).
   */
  updateFromContributions(contributions: github.Contributions) {
    const findRepoDay = (timestamp: string, repository: gql.Repository) =>
      // Timestamps (`occurredAt`) are UTC times, e.g. "2025-10-02T07:00:00Z",
      // so parsing with `new Date(str)` works correctly.
      this.repoDay(new Date(timestamp), repository);

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
      }
    }

    for (const node of contributions.issues) {
      findRepoDay(node.occurredAt, node.issue.repository)?.issues.add(
        node.issue.url,
      );
    }

    for (const node of contributions.prs) {
      findRepoDay(node.occurredAt, node.pullRequest.repository)?.prs.add(
        node.pullRequest.url,
      );
    }

    for (const node of contributions.repositories) {
      // If a repo is created twice in one day (I’m not sure that is possible)
      // this code will only record one creation. See doc comment about
      // idempotency above.
      findRepoDay(node.occurredAt, node.repository)?.setCreate(1);
    }

    for (const node of contributions.reviews) {
      findRepoDay(node.occurredAt, node.pullRequestReview.repository)?.reviews
        .add(node.pullRequestReview.url);
    }

    this.updateRepoCounts();
    this.updateRepoColors();
    return this;
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
  mostUsedRepos() {
    const repos = [...this.repositories.values()];
    repos.sort((a, b) => b.contributions - a.contributions);
    return repos;
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
    const repository = this.cleanRepository(repositorySource);

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
  cleanRepository(repositorySource: RepositorySource) {
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
 * Represents a single day in the contribution calendar.
 *
 * Tracks total contributions and per-repository activity.
 */
export class Day {
  /** Local time date */
  date: Date;
  contributionCount: number | null = null;
  repositories: Map<string, RepositoryDay> = new Map();

  constructor(
    date: Date,
    contributionCount: number | null = null,
  ) {
    // FIXME? ensure it's midnight local time?
    this.date = date;
    this.contributionCount = contributionCount;
  }

  /**
   * Checks if known contributions match the total contribution count.
   */
  addsUp() {
    return this.contributionCount == this.knownContributionCount();
  }

  /**
   * Sums up the contributions we know about from specific repositories.
   */
  knownContributionCount() {
    return [...this.repositories.values()].reduce(
      (total, repoDay) => total + repoDay.count(),
      0,
    );
  }

  /**
   * Get `RepositoryDay`s that are enabled by `filter`.
   */
  filteredRepos(filter: Filter) {
    return [...this.repositories.values()].filter((repoDay) =>
      filter.isOn(repoDay.url())
    );
  }

  /**
   * Calculate the known contribution count including just the repositories
   * enabled in `filter`.
   */
  filteredCount(filter: Filter) {
    return this.filteredRepos(filter).reduce(
      (total, repoDay) => total + repoDay.count(),
      0,
    );
  }

  /**
   * Was there a contribution to the passed repo on this day?
   */
  hasRepo(url: string) {
    return this.repositories.has(url);
  }
}

/**
 * Represents activity for a single repository on a single day.
 */
export class RepositoryDay {
  readonly repository: Repository;
  commitCount = 0;
  /** How many times the repo was created this day (typically 0, sometimes 1) */
  created = 0;
  /** Issue URLs */
  issues: Set<string> = new Set();
  /** PR URLs */
  prs: Set<string> = new Set();
  /** PR review URLs */
  reviews: Set<string> = new Set();

  constructor(repository: Repository) {
    this.repository = repository;
  }

  /**
   * Record commits for this day.
   */
  addCommits(count: number) {
    this.commitCount += count;
  }

  /**
   * Record commit counts for this day.
   */
  setCommits(count: number) {
    this.commitCount = count;
  }

  /**
   * Record repository creation for this day.
   */
  addCreate(count = 1) {
    this.created += count;
  }

  /**
   * Record repository creation count for this day.
   */
  setCreate(count: number) {
    this.created = count;
  }

  /**
   * Returns the repository URL.
   */
  url() {
    return this.repository.url;
  }

  /**
   * Returns the contribution count for this repository on this day.
   *
   * This only includes “known” contributions for events that we track, like
   * commits and PRs. The contribution count returned by the contribution
   * calendar may include other contributions we don’t check for.
   */
  count() {
    return this.created + this.commitCount + this.issues.size + this.prs.size +
      this.reviews.size;
  }
}

/**
 * A URL or a `Repository`-shaped object.
 */
export type RepositorySource = string | {
  url: string;
  isFork?: boolean;
  isPrivate?: boolean;
};

/**
 * Represents a GitHub repository with contribution tracking.
 */
export class Repository {
  url: string;
  isFork: boolean;
  isPrivate: boolean;
  /** Hue assigned for visualization (as degrees) */
  hue = 285;
  /** Total contribution count across all days */
  contributions = 0;

  constructor(url: string, isFork = false, isPrivate = false) {
    this.url = url;
    this.isFork = isFork;
    this.isPrivate = isPrivate;
  }

  /**
   * Convenience method to generate a `Repository` from a URL, or from a
   * `Repository`-shaped object.
   */
  static from(source: RepositorySource) {
    if (typeof source == "string") {
      return new Repository(source);
    } else {
      return new Repository(
        source.url,
        source.isFork ?? false,
        source.isPrivate ?? false,
      );
    }
  }

  /**
   * Returns an [OKLCH](https://en.wikipedia.org/wiki/Oklab_color_space) color
   * string for this repository.
   */
  color(lightness = 55, chroma = 0.2) {
    return `oklch(${lightness}% ${chroma} ${this.hue}deg)`;
  }
}

/**
 * Return a new `Date` that is `days` days after `date`.
 */
function plusDays(date: Date, days: number) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}
