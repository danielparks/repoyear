import { Repository } from "./Repository.ts";
import { ALL_ON, Filter } from "./Filter.ts";

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
   * Get number of issues opened on this repository on this day.
   */
  issueCount(filter: Filter = ALL_ON) {
    return this.filteredRepos(filter).reduce(
      (total, repoDay) => total + repoDay.issues.size,
      0,
    );
  }

  /**
   * Get number of PRs opened on this repository on this day.
   */
  prCount(filter: Filter = ALL_ON) {
    return this.filteredRepos(filter).reduce(
      (total, repoDay) => total + repoDay.prs.size,
      0,
    );
  }

  /**
   * Get number of PR reviews opened on this repository on this day.
   */
  reviewCount(filter: Filter = ALL_ON) {
    return this.filteredRepos(filter).reduce(
      (total, repoDay) => total + repoDay.reviews.size,
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
