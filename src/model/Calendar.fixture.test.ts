/**
 * Integration tests using real GitHub API fixture data.
 */
import { assert, assertEquals } from "@std/assert";
import { ALL_ON } from "./Filter.ts";
import { Calendar } from "./index.ts";
import type { Contributions } from "../github/api.ts";
import extraWeekFixture from "../__fixtures__/github-extra-week.json" with {
  type: "json",
};
import threeYearFixture from "../__fixtures__/github-3-years.json" with {
  type: "json",
};

const extraWeekContributions = extraWeekFixture as Contributions[];
const threeYearContributions = threeYearFixture as Contributions[];

// ----------------------------------------------------------------------------
// Extra-week handling
// ----------------------------------------------------------------------------

// The extra-week fixture has commits for 2025-03-30 through 2025-04-05 in chunk
// 1, which has no summary calendar. Those dates are before the summary start of
// 2025-04-06 and should be silently dropped.
//
// Currently fails because `repoDay()` creates new days for those dates,
// extending the calendar backward.
Deno.test("Calendar should not create days from specific events outside summary range", () => {
  const calendar = Calendar.fromContributions({
    gitHub: extraWeekContributions,
  });

  // Summary calendar starts 2025-04-06. Any day before that with
  // knownContributionCount() > 0 came from the spurious extra-week events.
  const summaryStart = new Date(2025, 3, 6); // April 6, 2025
  for (const day of calendar.days) {
    if (day.date < summaryStart) {
      assertEquals(
        day.knownContributionCount(),
        0,
        `Day ${
          day.date.toISOString().slice(0, 10)
        } should have no specific contributions`,
      );
    }
  }
});

// ----------------------------------------------------------------------------
// Multi-year loading
// ----------------------------------------------------------------------------

// Three years of data loaded in sequence should produce a calendar that spans
// the full date range of all three year summaries.
Deno.test("Calendar should span all years when loading multi-year data", () => {
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
  });

  // Year 3 summary starts 2023-04-09; year 1 summary ends 2026-04-05.
  // The calendar is padded to week boundaries (Sunday–Saturday), so we check
  // with a little slack.
  const expectedStart = new Date(2023, 3, 9); // April 9, 2023
  const expectedEnd = new Date(2026, 3, 5); // April 5, 2026

  const firstDay = calendar.days[0];
  const lastDay = calendar.days.at(-1)!;

  assert(
    firstDay.date <= expectedStart,
    `Calendar should start on or before ${
      expectedStart.toISOString().slice(0, 10)
    }, got ${firstDay.date.toISOString().slice(0, 10)}`,
  );
  assert(
    lastDay.date >= expectedEnd,
    `Calendar should end on or after ${
      expectedEnd.toISOString().slice(0, 10)
    }, got ${lastDay.date.toISOString().slice(0, 10)}`,
  );
});

// Days at year boundaries should have summary data from both adjacent year
// queries — specifically the day before and after each boundary.
Deno.test("Calendar should have summary data for year-boundary days", () => {
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
  });

  const daysByDate = new Map<string, (typeof calendar.days)[0]>();
  for (const day of calendar.days) {
    daysByDate.set(day.date.toISOString().slice(0, 10), day);
  }

  // Year 1 starts 2025-04-06, year 2 ends 2025-04-05.
  // Year 2 starts 2024-04-07, year 3 ends 2024-04-06.
  for (
    const dateStr of ["2025-04-05", "2025-04-06", "2024-04-06", "2024-04-07"]
  ) {
    const day = daysByDate.get(dateStr);
    assert(day !== undefined, `Day ${dateStr} should exist in calendar`);
    assert(
      day!.contributionCount !== null,
      `Day ${dateStr} should have summary data (contributionCount)`,
    );
  }
});

// Loading the same year twice (simulating re-fetch) should not double the
// contribution counts at year boundaries where summaries overlap.
Deno.test("Calendar should not double-count contributions at year boundaries", () => {
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
  });

  const daysByDate = new Map<string, (typeof calendar.days)[0]>();
  for (const day of calendar.days) {
    daysByDate.set(day.date.toISOString().slice(0, 10), day);
  }

  // 2025-04-05 appears in both year 1 and year 2 summaries. Its
  // filteredCount() should equal its contributionCount (no double-counting).
  const boundaryDay = daysByDate.get("2025-04-05")!;
  assert(boundaryDay !== undefined, "boundary day should exist");
  assert(
    boundaryDay.contributionCount !== null,
    "boundary day should have summary data",
  );

  // filteredCount should not exceed contributionCount.
  assert(
    boundaryDay.filteredCount(ALL_ON) <= boundaryDay.contributionCount!,
    `filteredCount (${
      boundaryDay.filteredCount(ALL_ON)
    }) should not exceed contributionCount (${boundaryDay.contributionCount}) at year boundary`,
  );
});
