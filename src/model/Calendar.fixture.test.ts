/**
 * Integration tests using real GitHub API fixture data.
 */
import { assert, assertEquals, assertGreaterOrEqual } from "@std/assert";
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

Deno.test("Calendar summary data should match specific data", () => {
  const calendar = Calendar.fromContributions({
    gitHub: extraWeekContributions,
    endDate: getLastDate(extraWeekContributions),
  });

  for (const day of calendar.days) {
    const specific = day.knownContributionCount();
    // contributionCount may be null if there is no summary data, but in that
    // case there should be no specific data. The assert message will show that
    // the summary count is null in that case.
    assertGreaterOrEqual(
      day.contributionCount ?? 0,
      specific,
      `Day ${day.dateString()} has more specific contributions (${specific})` +
        ` than summary (${day.contributionCount})`,
    );
  }
});

// ----------------------------------------------------------------------------
// Extra-week handling
// ----------------------------------------------------------------------------

// The extra-week fixture has commits for 2025-03-30 through 2025-04-05, but no
// summary calendar data for those days. Those dates should be silently dropped.
Deno.test("Calendar should not create days from specific events outside summary range", () => {
  const summaryStart = getFirstDate(extraWeekContributions);

  let found = false;
  for (const contributions of extraWeekContributions) {
    for (const repo of contributions.commits) {
      for (const commit of repo.contributions!.nodes ?? []) {
        if (commit && new Date(commit.occurredAt) < summaryStart) {
          found = true;
          break;
        }
      }
    }
  }
  assert(found, `No commits before first summary day (${summaryStart})`);

  const calendar = Calendar.fromContributions({
    gitHub: extraWeekContributions,
    endDate: getLastDate(extraWeekContributions),
  });
  for (const day of calendar.days) {
    if (day.date < summaryStart) {
      assertEquals(
        day.knownContributionCount(),
        0,
        `Day ${day.dateString()} (before ${summaryStart}) should have no ` +
          "specific contributions",
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
  const daysByDate = Calendar.fromContributions({
    gitHub: threeYearContributions,
    endDate: expectedEnd,
    years: 3,
  }).daysByDate();

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
  const daysByDate = Calendar.fromContributions({
    gitHub: threeYearContributions,
    endDate: expectedEnd,
    years: 3,
  }).daysByDate();

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
