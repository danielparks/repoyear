/**
 * Tests that specific events from paginated API responses (chunks with no
 * summary calendar) are correctly attributed to repositories.
 *
 * When GitHub has more than 100 contributions of a given type in a year, it
 * paginates them across multiple API responses. Only the first response
 * includes a summary calendar; subsequent pages have `calendar: undefined`.
 */
import { assertEquals } from "@std/assert";
import { ALL_ON, Calendar } from "./index.ts";
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
  return {
    login: "testuser",
    name: "Test User",
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
    commits: [],
    issues: [],
    prs: [],
    repositories: [],
    reviews: [],
    ...partial,
  } as unknown as Contributions;
}

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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  // June 1 is covered by the first chunk — should always be linked.
  const june1 = days.get("2024-06-01")!;
  assertEquals(
    june1?.contributionCount,
    1,
    "June 1 should have 1 contribution",
  );
  assertEquals(
    june1?.unknownCount(),
    0,
    "June 1 should have no unknown contributions",
  );

  // June 15 is covered by the second (paginated) chunk — currently broken.
  const june15 = days.get("2024-06-15")!;
  assertEquals(
    june15?.contributionCount,
    1,
    "June 15 should have 1 contribution",
  );
  assertEquals(
    june15?.unknownCount(),
    0,
    "June 15 commit should not be unknown (it was on paginated page 2)",
  );
  assertEquals(
    june15?.repositories.has(REPO_URL),
    true,
    "June 15 should be linked to the repo",
  );
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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  const june15 = days.get("2024-06-15")!;
  assertEquals(june15?.contributionCount, 1);
  assertEquals(
    june15?.unknownCount(),
    0,
    "June 15 issue should not be unknown (it was on paginated page 2)",
  );
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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  const june15 = days.get("2024-06-15")!;
  assertEquals(june15?.contributionCount, 1);
  assertEquals(
    june15?.unknownCount(),
    0,
    "June 15 PR should not be unknown (it was on paginated page 2)",
  );
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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 1,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  const june15 = days.get("2024-06-15")!;
  assertEquals(june15?.contributionCount, 1);
  assertEquals(
    june15?.unknownCount(),
    0,
    "June 15 review should not be unknown (it was on paginated page 2)",
  );
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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 2,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  for (
    const dateStr of ["2024-06-01", "2024-06-15", "2023-06-01", "2023-06-15"]
  ) {
    const day = days.get(dateStr);
    assertEquals(
      day?.contributionCount,
      1,
      `${dateStr} should have 1 contribution`,
    );
    assertEquals(
      day?.unknownCount(),
      0,
      `${dateStr} should have no unknown contributions`,
    );
    assertEquals(
      day?.repositories.has(REPO_URL),
      true,
      `${dateStr} should be linked to the repo`,
    );
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

  const calendar = Calendar.fromContributions({
    gitHub,
    endDate: new Date(2024, 11, 31),
    years: 2,
  });

  const days = new Map(
    calendar.days.map((d) => [d.date.toISOString().slice(0, 10), d]),
  );

  const boundaryDay = days.get("2024-06-01")!;
  assertEquals(
    boundaryDay?.contributionCount,
    2,
    "Boundary day has 2 contributions",
  );
  assertEquals(
    boundaryDay?.filteredCount(ALL_ON),
    2,
    "Boundary day should not be double-counted from paginated older-year chunk",
  );
});
