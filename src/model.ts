import * as github from "./github/api.ts";
import * as gql from "./github/gql.ts";

function parseDateTime(input: string) {
  const [year, month, ...rest] = input
    .split(/\D+/)
    .map((n) => Number.parseInt(n, 10));
  return new Date(year, month - 1, ...rest);
}

// Convert a date time to a date in UTC.
//
// This converts a local date time to its localtime date, then encodes it in UTC
// for simpler date math (UTC has no daylight saving time).
function toUtcDate(input: Date) {
  return Date.UTC(input.getFullYear(), input.getMonth(), input.getDate());
}

export class Filter {
  defaultState: boolean = true;
  states: Map<string, boolean> = new Map();

  static withRepos(...urls: string[]) {
    const filter = new Filter();
    urls.forEach((url) => {
      filter.states.set(url, true);
    });
    return filter;
  }

  isOn(url: string) {
    return this.states.get(url);
  }

  clone() {
    const filter = new Filter();
    filter.defaultState = this.defaultState;
    filter.states = new Map(this.states);
    return filter;
  }

  // Return a new Filter if the urls don’t exist in this one, otherwise null.
  addReposIfMissing(urls: string[]): Filter | null {
    let newFilter: Filter | null = null;
    urls.forEach((url) => {
      if (!this.states.has(url)) {
        if (!newFilter) {
          newFilter = this.clone();
        }
        newFilter.states.set(url, this.defaultState);
      }
    });
    return newFilter;
  }

  switchRepo(url: string, enabled: boolean) {
    this.states.set(url, enabled);
  }

  activeUrls() {
    return [...this.states.entries()]
      .filter(([_, value]) => value)
      .map(([key, _]) => key);
  }
}

export class Calendar {
  name: string; // User’s name.
  start: Date;
  start_ms: number; // UTC date encoded as ms since 1970.
  days: Day[];
  repositories = new Map<string, Repository>();

  constructor(name: string, start: Date, days: Day[] = []) {
    this.name = name;
    this.start = start;
    this.start_ms = toUtcDate(start);
    this.days = days;
  }

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

  updateFromContributions(contributions: github.Contributions) {
    // FIXME Ignores contributions.calendar; everything is loaded in first loop.
    // However, if we want to add contributions from another date range this
    // won’t work.

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

    return this;
  }

  repoUrls() {
    return this.repositories.keys();
  }

  repoDay(timestamp: string, repository: gql.Repository) {
    // timestamps (occurredAt) as either dates or datetimes explicitly in UTC,
    // e.g. "2025-10-02T07:00:00Z" or "2025-11-06T21:41:51Z", so parsing with
    // `new Date(str)` should be fine.
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

  // Expects localtime date.
  day(date: Date): Day | undefined {
    // FIXME doens’t handle out-of-range dates well.
    return this.days[Math.round((toUtcDate(date) - this.start_ms) / 86400000)];
  }

  // Convert a GraphQL repository into a local, deduplicated repo.
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

  // FIXME test this.
  *weeks() {
    // Weeks always start on Sunday; if .start isn’t Sunday, pad with null Days.
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

  // Do the contributions we know about add up to the contribution count?
  addsUp() {
    return this.contributionCount == this.knownContributionCount();
  }

  // Add up the contributions we know about specifically.
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

export class RepositoryDay {
  readonly repository: Repository;
  commitCount = 0;
  // How many times the repo was created this day. (Typically 0, sometimes 1.)
  created = 0;
  // Issue urls
  issues: string[] = [];
  // PR urls
  prs: string[] = [];
  // PR review urls
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

// Rotate through the hues.
let LAST_HUE = 270 - 55;
function nextHue() {
  LAST_HUE = (LAST_HUE + 55) % 360;
  return LAST_HUE;
}

export class Repository {
  url: string;
  isFork: boolean;
  isPrivate: boolean;
  hue = 270;

  constructor(url: string, isFork = false, isPrivate = false) {
    this.url = url;
    this.isFork = isFork;
    this.isPrivate = isPrivate;
    this.hue = nextHue();
  }

  color(lightness = 50) {
    return `hsl(${this.hue.toString()}deg 70 ${lightness.toString()})`;
  }
}
