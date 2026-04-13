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

function getFirstDate(contributions: Contributions[]): Date {
  return new Date(
    contributions.filter((c) => c.calendar).at(-1)!.calendar!.weeks.at(0)!
      .contributionDays.at(0)!.date,
  );
}

function getLastDate(contributions: Contributions[]): Date {
  return new Date(
    contributions[0]!.calendar!.weeks.at(-1)!.contributionDays.at(-1)!.date,
  );
}

// ----------------------------------------------------------------------------
// Extra-week handling
// ----------------------------------------------------------------------------

// The extra-week fixture has commits for 2025-03-30 through 2025-04-05 in chunk
// 1, which has no summary calendar. Those dates are before the summary start of
// 2025-04-06 and should be silently dropped.
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
  const expectedStart = getFirstDate(threeYearContributions);
  const expectedEnd = getLastDate(threeYearContributions);
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
    endDate: expectedEnd,
    years: 3,
  });

  const firstDate = calendar.days[0].date;
  const lastDate = calendar.days.at(-1)!.date;

  assert(
    firstDate.getDay() == 0,
    "Calendar should start on a Sunday",
  );
  assert(
    lastDate.getDay() == 6,
    "Calendar should end on a Saturday",
  );
  assert(
    Math.abs(
      Math.round((firstDate.getTime() - expectedStart.getTime()) / 86400000),
    ) <= 7,
    "Calendar should start within a week of the expected date",
  );
  assert(
    Math.abs(
      Math.round((lastDate.getTime() - expectedEnd.getTime()) / 86400000),
    ) <= 7,
    "Calendar should start within a week of the expected date",
  );
  assert(
    Math.round(lastDate.getFullYear() - firstDate.getFullYear()) == 3,
    "Calendar should be roughly 3 years long",
  );
});

// Days at year boundaries should have summary data from both adjacent year
// queries — specifically the day before and after each boundary.
Deno.test("Calendar should have summary data for year-boundary days", () => {
  const expectedEnd = getLastDate(threeYearContributions);
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
    endDate: expectedEnd,
    years: 3,
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
  const expectedEnd = getLastDate(threeYearContributions);
  const calendar = Calendar.fromContributions({
    gitHub: threeYearContributions,
    endDate: expectedEnd,
    years: 3,
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
