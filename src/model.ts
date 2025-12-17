import * as github from "./github/api.ts";
import * as gql from "./github/gql.ts";

/**
 * Parses an ISO date string (e.g., "2025-01-15") into a Date object.
 */
function parseDateTime(input: string) {
  const [year, month, ...rest] = input
    .split(/\D+/)
    .map((n) => Number.parseInt(n, 10));
  return new Date(year, month - 1, ...rest);
}

/**
 * Converts a local Date to UTC milliseconds, preserving the date (not time).
 *
 * This encodes the localtime date in UTC for simpler date math, since UTC
 * has no daylight saving time.
 */
function toUtcDate(input: Date) {
  return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate());
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

  clone() {
    const filter = new Filter();
    filter.defaultState = this.defaultState;
    filter.states = new Map(this.states);
    return filter;
  }

  switchRepo(url: string, enabled: boolean) {
    this.states.set(url, enabled);
  }
}

/**
 * Represents a user's contribution calendar over a date range.
 *
 * Contains all contributions organized by day and repository.
 */
export class Calendar {
  name: string;
  start: Date;
  /** UTC date encoded as ms since 1970 */
  start_ms: number;
  days: Day[];
  repositories = new Map<string, Repository>();

  constructor(name: string, start: Date, days: Day[] = []) {
    this.name = name;
    this.start = start;
    this.start_ms = toUtcDate(start);
    this.days = days;
  }

  /**
   * Creates a Calendar from GitHub contributions data.
   */
  static fromContributions(contributions: github.Contributions) {
    const calendar = new Calendar(
      contributions.name,
      parseDateTime(contributions.calendar.weeks[0].contributionDays[0].date),
      contributions.calendar.weeks.map((week) =>
        week.contributionDays.map((day) =>
          new Day(parseDateTime(day.date), day.contributionCount)
        )
      ).flat(),
    );
    return calendar.updateFromContributions(contributions);
  }

  /**
   * Merges additional contributions data into this calendar.
   */
  updateFromContributions(contributions: github.Contributions) {
    // FIXME: Ignores contributions.calendar; everything is loaded in first loop.
    // If we want to add contributions from another date range this won't work.

    for (const entry of contributions.commits) {
      const { repository, contributions: { nodes } } = entry;
      for (const node of github.cleanNodes(nodes)) {
        this.repoDay(node.occurredAt, repository)?.addCommits(node.commitCount);
      }
    }

    for (const node of contributions.issues) {
      this.repoDay(node.occurredAt, node.issue.repository)?.issues.push(
        node.issue.url,
      );
    }

    for (const node of contributions.prs) {
      this.repoDay(node.occurredAt, node.pullRequest.repository)?.prs.push(
        node.pullRequest.url,
      );
    }

    for (const node of contributions.repositories) {
      this.repoDay(node.occurredAt, node.repository)?.addCreate();
    }

    for (const node of contributions.reviews) {
      this.repoDay(node.occurredAt, node.pullRequestReview.repository)?.reviews
        .push(node.pullRequestReview.url);
    }

    this.updateRepoCounts();
    this.updateRepoColors();
    return this;
  }

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

  repoUrls() {
    return this.repositories.keys();
  }

  /**
   * Gets the RepositoryDay for a given timestamp and repository.
   *
   * Timestamps (occurredAt) are dates or datetimes in UTC (e.g.,
   * "2025-10-02T07:00:00Z"), so parsing with `new Date(str)` works correctly.
   */
  repoDay(timestamp: string, repository: gql.Repository) {
    const day = this.day(new Date(timestamp));
    if (!day) {
      console.warn(`Date "${timestamp}" not in calendar`);
      return;
    }

    let repoDay = day.repositories.get(repository.url);
    if (!repoDay) {
      repoDay = new RepositoryDay(this.cleanRepository(repository));
      day.repositories.set(
        repository.url,
        repoDay,
      );
    }
    return repoDay;
  }

  /**
   * Gets the Day for a given localtime date.
   *
   * FIXME: doesn't handle out-of-range dates well.
   */
  day(date: Date): Day | undefined {
    return this.days[Math.round((toUtcDate(date) - this.start_ms) / 86400000)];
  }

  /**
   * Converts a GraphQL repository into a deduplicated local Repository object.
   */
  cleanRepository({ url, isFork, isPrivate }: gql.Repository) {
    let repository = this.repositories.get(url);
    if (!repository) {
      repository = new Repository(url, isFork, isPrivate);
      this.repositories.set(url, repository);
    }
    return repository;
  }

  maxContributions() {
    return Math.max(
      ...this.days
        .filter((day) => day.contributionCount !== null)
        .map((day) => day.contributionCount as number),
    );
  }

  /**
   * Yields weeks (7-day arrays) of Days, starting on Sunday.
   *
   * Pads the first week if the start date isn't Sunday.
   * FIXME: test this.
   */
  *weeks() {
    const firstWeek: Day[] = [];
    const date = new Date(this.start);
    for (let i = 0; i < this.start.getDay(); i++) {
      firstWeek.push(new Day(date));
      date.setDate(date.getDate() + 1);
    }
    firstWeek.push(...this.days.slice(0, 7 - this.start.getDay()));
    yield firstWeek;

    for (let i = 7 - this.start.getDay(); i < this.days.length; i += 7) {
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
  date: Date;
  contributionCount: number | null = null;
  repositories: Map<string, RepositoryDay> = new Map();

  constructor(
    date: Date,
    contributionCount: number | null = null,
  ) {
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

  filteredRepos(filter: Filter) {
    return [...this.repositories.values()].filter((repoDay) =>
      filter.isOn(repoDay.url())
    );
  }

  filteredCount(filter: Filter) {
    return this.filteredRepos(filter).reduce(
      (total, repoDay) => total + repoDay.count(),
      0,
    );
  }

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
  issues: string[] = [];
  /** PR URLs */
  prs: string[] = [];
  /** PR review URLs */
  reviews: string[] = [];

  constructor(repository: Repository) {
    this.repository = repository;
  }

  addCommits(count: number) {
    this.commitCount += count;
  }

  addCreate(count = 1) {
    this.created += count;
  }

  url() {
    return this.repository.url;
  }

  count() {
    return this.created + this.commitCount + this.issues.length +
      this.prs.length + this.reviews.length;
  }
}

/**
 * Represents a GitHub repository with contribution tracking.
 */
export class Repository {
  url: string;
  isFork: boolean;
  isPrivate: boolean;
  /** Color hue assigned for visualization */
  hue = 285;
  /** Total contribution count across all days */
  contributions = 0;

  constructor(url: string, isFork = false, isPrivate = false) {
    this.url = url;
    this.isFork = isFork;
    this.isPrivate = isPrivate;
  }

  /**
   * Returns an OKLCH color string for this repository.
   */
  color(lightness = 55, chroma = 0.2) {
    return `oklch(${lightness}% ${chroma} ${this.hue}deg)`;
  }
}
