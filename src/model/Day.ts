import { Repository } from "./Repository.ts";
import { ALL_ON, Filter } from "./Filter.ts";
import { sum } from "../util.ts";

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
   * Get the date as days since the epoch.
   */
  epochDay() {
    return toEpochDays(this.date);
  }

  /**
   * Do we have data about this day?
   *
   * The day doesn’t necessarily need to have any contributions; it just needs
   * to have been included in query results.
   */
  hasData() {
    // FIXME knownContributionCount is inefficient
    return this.contributionCount !== null ||
      this.knownContributionCount() > 0;
  }

  /**
   * Sums up the contributions we know about from specific repositories.
   */
  knownContributionCount() {
    return sum(this.repositories.values(), (repoDay) => repoDay.count());
  }

  /**
   * Get number of contributions that we don’t specifically know about.
   */
  unknownCount() {
    return (this.contributionCount || 0) - this.knownContributionCount();
  }

  /**
   * Get `RepositoryDay`s that are enabled by `filter`.
   */
  filteredRepos(filter: Filter): RepositoryDay[] {
    return [...this.repositories.values()].filter((repoDay) =>
      filter.isOn(repoDay.url())
    );
  }

  /**
   * Calculate the contribution count for repositories enabled in `filter`.
   *
   * This includes unknown contributions unconditionally.
   */
  filteredCount(filter: Filter): number {
    return sum(this.filteredRepos(filter), (repoDay) => repoDay.count()) +
      Math.max(this.unknownCount(), 0);
  }

  /**
   * Get number of issues opened on this repository on this day.
   */
  issueCount(filter: Filter = ALL_ON): number {
    return sum(this.filteredRepos(filter), (repoDay) => repoDay.issues.size);
  }

  /**
   * Get number of PRs opened on this repository on this day.
   */
  prCount(filter: Filter = ALL_ON) {
    return sum(this.filteredRepos(filter), (repoDay) => repoDay.prs.size);
  }

  /**
   * Get number of PR reviews opened on this repository on this day.
   */
  reviewCount(filter: Filter = ALL_ON) {
    return sum(this.filteredRepos(filter), (repoDay) => repoDay.reviews.size);
  }

  /**
   * Was there a contribution to the passed repo on this day?
   */
  hasRepo(url: string) {
    return this.repositories.has(url);
  }

  /**
   * Set the commit count for a particularly repository.
   */
  setRepoCommits(repository: Repository, count: number) {
    let repoDay = this.repositories.get(repository.url);
    if (!repoDay) {
      repoDay = new RepositoryDay(repository);
      this.repositories.set(repository.url, repoDay);
    }
    repoDay.commitCount = count;
  }
}

// 1000 years before and after 1970.
export const EPOCH_DAY_MIN = -365000;
export const EPOCH_DAY_MAX = 365000;

/**
 * Converts a local time `Date` to days since the epoch.
 */
export function toEpochDays(input: Date) {
  return Math.round(
    Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()) / 86400000,
  );
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
