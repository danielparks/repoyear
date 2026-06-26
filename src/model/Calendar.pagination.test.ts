/**
 * Tests that specific events from paginated API responses (chunks with no
 * summary calendar) are correctly attributed to repositories.
 *
 * When GitHub has more than 100 contributions of a given type in a year, it
 * paginates them across multiple API responses. Our query only requests the
 * summary calendar for the first page; subsequent pages have
 * `calendar: undefined`.
 */
import { assert, assertEquals } from "@std/assert";
import { Calendar, Day } from "./index.ts";
import type { Contributions } from "../github/api.ts";

const REPO_URL = "https://github.com/test/repo";
const REPO = { url: REPO_URL, isFork: false, isPrivate: false };

/** Build a commit contributions-by-repo entry for a set of date/count pairs. */
function commitsEntry(dates: Array<[string, number]>) {
  return [{
    repository: REPO,
    contributions: {
      nodes: dates.map(([date, count]) => ({
        commitCount: count,
        isRestricted: false,
        occurredAt: `${date}T12:00:00Z`,
      })),
    },
  }];
}

/** Build a list of issue contribution nodes. */
function issueNodes(dates: Array<[string, number]>): object[] {
  return dates.map(([date, n]) => ({
    isRestricted: false,
    occurredAt: `${date}T12:00:00Z`,
    issue: { repository: REPO, url: `${REPO_URL}/issues/${n}` },
  }));
}

/** Build a list of PR contribution nodes. */
function prNodes(dates: Array<[string, number]>): object[] {
  return dates.map(([date, n]) => ({
    isRestricted: false,
    occurredAt: `${date}T12:00:00Z`,
    pullRequest: { repository: REPO, url: `${REPO_URL}/pull/${n}` },
  }));
}

/** Build a list of PR review contribution nodes. */
function reviewNodes(dates: Array<[string, number]>): object[] {
  return dates.map(([date, n]) => ({
    isRestricted: false,
    occurredAt: `${date}T12:00:00Z`,
    pullRequestReview: { repository: REPO, url: `${REPO_URL}/pull/${n}` },
  }));
}

/** Minimal chunk without a summary calendar (simulates a pagination page). */
function paginatedChunk(partial: object): Contributions {
  return {
    login: "testuser",
    name: "Test User",
    commits: [],
    issues: [],
    prs: [],
    repositories: [],
    reviews: [],
    ...partial,
  } as unknown as Contributions;
}

/** Contributions chunk with a summary calendar covering the given dates. */
function summaryChunk(
  dates: Array<[string, number]>,
  partial: object,
): Contributions {
  return paginatedChunk({
    calendar: {
      totalContributions: dates.reduce((s, [, n]) => s + n, 0),
      weeks: dates.map(([date, count]) => ({
        contributionDays: [{
          date,
          contributionCount: count,
          contributionLevel: count > 0 ? "FIRST_QUARTILE" : "NONE",
        }],
      })),
    },
    ...partial,
  });
}

type NumberMethodNames<T> = {
  [K in keyof T]: T[K] extends () => number ? K : never;
}[keyof T];

/** Make an assertion function for a count method on `Day`. */
function makeDayCountAssert(name: string, method: NumberMethodNames<Day>) {
  return (day: Day, expected: number, message: string = "") => {
    const func = day[method] as unknown as () => number;
    assertEquals(
      func.apply(day, []),
      expected,
      `${day.dateString()} ${name} should equal ${expected}${
        message && ": " + message
      }`,
    );
  };
}

/** Assert `day`’s contributionCount equals `expected`. */
function assertContributionCount(
  day: Day,
  expected: number,
  message: string = "",
) {
  assertEquals(
    day.contributionCount,
    expected,
    `${day.dateString()} contributionCount should equal ${expected}${
      message && ": " + message
    }`,
  );
}

/** Assert `day`’s calculated contributions equal `expected`. */
const assertContributions = makeDayCountAssert(
  "known contributions",
  "knownContributionCount",
);

/** Assert `day`’s commits equal `expected`. */
const assertCommits = makeDayCountAssert("commits", "commitCount");

/** Assert `day`’s issues equal `expected`. */
const assertIssues = makeDayCountAssert("issues", "issueCount");

/** Assert `day`’s PRs equal `expected`. */
const assertPrs = makeDayCountAssert("PRs", "prCount");

/** Assert `day`’s PR reviews equal `expected`. */
const assertReviews = makeDayCountAssert("PR reviews", "reviewCount");

/** Assert `day`’s unknowns equal `expected`. */
const assertUnknowns = makeDayCountAssert("unknowns", "unknownCount");

// ─────────────────────────────────────────────────────────────────────────────
// Commit pagination
// ─────────────────────────────────────────────────────────────────────────────

// The first API page includes the summary calendar and the first commit.
// The second API page has no summary but carries additional commits for the
// same year. Those commits should be linked to the repo, not shown as unknown.
Deno.test("Calendar should link commits from paginated second chunk", () => {
  const gitHub: Contributions[] = [
    summaryChunk(
      [["2024-06-01", 1], ["2024-06-15", 1]],
      { commits: commitsEntry([["2024-06-01", 1]]) },
    ),
    // Second page: same year, no summary calendar.
    paginatedChunk({ commits: commitsEntry([["2024-06-15", 1]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  }).daysByDate();

  // June 1 is covered by the first chunk — should always be linked.
  const june1 = days.get("2024-06-01")!;
  assertContributionCount(june1, 1, "first chunk");
  assertContributions(june1, 1, "first chunk");
  assertCommits(june1, 1, "first chunk");
  assertUnknowns(june1, 0, "first chunk");

  // June 15 is covered by the second (paginated) chunk.
  const june15 = days.get("2024-06-15")!;
  assertContributionCount(june15, 1, "second chunk");
  assertContributions(june15, 1, "second chunk");
  assertCommits(june15, 1, "second chunk");
  assertUnknowns(june15, 0, "second chunk");
  assert(june15.repositories.has(REPO_URL), "6/15 should have repo");
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue pagination
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("Calendar should link issues from paginated second chunk", () => {
  const gitHub: Contributions[] = [
    summaryChunk(
      [["2024-06-01", 1], ["2024-06-15", 1]],
      { issues: issueNodes([["2024-06-01", 1]]) },
    ),
    paginatedChunk({ issues: issueNodes([["2024-06-15", 2]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  }).daysByDate();

  const june15 = days.get("2024-06-15")!;
  assertContributionCount(june15, 1, "second chunk");
  assertContributions(june15, 1, "second chunk");
  assertIssues(june15, 1, "second chunk");
  assertUnknowns(june15, 0, "second chunk");
});

// ─────────────────────────────────────────────────────────────────────────────
// PR pagination
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("Calendar should link PRs from paginated second chunk", () => {
  const gitHub: Contributions[] = [
    summaryChunk(
      [["2024-06-01", 1], ["2024-06-15", 1]],
      { prs: prNodes([["2024-06-01", 1]]) },
    ),
    paginatedChunk({ prs: prNodes([["2024-06-15", 2]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  }).daysByDate();

  const june15 = days.get("2024-06-15")!;
  assertContributionCount(june15, 1, "second chunk");
  assertContributions(june15, 1, "second chunk");
  assertPrs(june15, 1, "second chunk");
  assertUnknowns(june15, 0, "second chunk");
});

// ─────────────────────────────────────────────────────────────────────────────
// PR review pagination
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("Calendar should link PR reviews from paginated second chunk", () => {
  const gitHub: Contributions[] = [
    summaryChunk(
      [["2024-06-01", 1], ["2024-06-15", 1]],
      { reviews: reviewNodes([["2024-06-01", 1]]) },
    ),
    paginatedChunk({ reviews: reviewNodes([["2024-06-15", 2]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  }).daysByDate();

  const june15 = days.get("2024-06-15")!;
  assertContributionCount(june15, 1, "second chunk");
  assertContributions(june15, 1, "second chunk");
  assertReviews(june15, 1, "second chunk");
  assertUnknowns(june15, 0, "second chunk");
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-year: paginated pages in older years
// ─────────────────────────────────────────────────────────────────────────────

// When loading multiple years, each year's paginated pages must not be dropped
// by the lock set at the start of that year's summary. This test covers both
// the most recent year (2024) and an older year (2023).
Deno.test("Calendar should link paginated events across multiple years", () => {
  const gitHub: Contributions[] = [
    // Year 0 (2024): page 1 — has summary, first event.
    summaryChunk(
      [["2024-06-01", 1], ["2024-06-15", 1]],
      { commits: commitsEntry([["2024-06-01", 1]]) },
    ),
    // Year 0 (2024): page 2 — no summary, second event for the same year.
    paginatedChunk({ commits: commitsEntry([["2024-06-15", 1]]) }),
    // Year 1 (2023): page 1 — has summary, first event.
    summaryChunk(
      [["2023-06-01", 1], ["2023-06-15", 1]],
      { commits: commitsEntry([["2023-06-01", 1]]) },
    ),
    // Year 1 (2023): page 2 — no summary, second event for the older year.
    paginatedChunk({ commits: commitsEntry([["2023-06-15", 1]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 2,
  }).daysByDate();

  for (
    const dateStr of ["2024-06-01", "2024-06-15", "2023-06-01", "2023-06-15"]
  ) {
    const day = days.get(dateStr)!;
    assertContributionCount(day, 1);
    assertContributions(day, 1);
    assertCommits(day, 1);
    assertUnknowns(day, 0);
    assert(day.repositories.has(REPO_URL), `${dateStr} should have repo`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// No double-counting: paginated events must not bleed across year boundaries
// ─────────────────────────────────────────────────────────────────────────────

// When year boundaries overlap (GitHub quirk), paginated pages from the older
// year must not add extra contributions to days owned by the newer year.
Deno.test("Calendar should not double-count via paginated chunks at year boundaries", () => {
  // Year 0 (2024): summary covers 2024-06-01 with 2 commits.
  // Year 1 (2023): summary also covers 2024-06-01 (overlap, GitHub quirk).
  // Year 1's paginated page has an event for 2024-06-01.
  // That event must NOT be added on top of what year 0 already recorded.
  const gitHub: Contributions[] = [
    summaryChunk(
      [["2024-06-01", 2]],
      { commits: commitsEntry([["2024-06-01", 2]]) },
    ),
    // Year 1 summary also covers the boundary day (GitHub overlap quirk).
    summaryChunk(
      [["2023-06-01", 1], ["2024-06-01", 2]],
      { commits: commitsEntry([["2023-06-01", 1]]) },
    ),
    // Year 1 paginated page — the boundary day event must not be added again.
    paginatedChunk({ commits: commitsEntry([["2024-06-01", 2]]) }),
  ];

  const days = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 2,
  }).daysByDate();

  const boundaryDay = days.get("2024-06-01")!;
  assertContributionCount(boundaryDay, 2);
  assertContributions(boundaryDay, 2);
  assertCommits(boundaryDay, 2);
  assertUnknowns(boundaryDay, 0);
});
