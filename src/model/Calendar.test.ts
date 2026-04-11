import { assertEquals, assertStrictEquals } from "@std/assert";
import { Calendar, Day, Repository } from "./index.ts";
import * as gql from "../github/gql.ts";

Deno.test("Calendar should return repository URLs", () => {
  const calendar = new Calendar("testuser");
  calendar.repositories.set(
    "https://github.com/test/repo1",
    new Repository("https://github.com/test/repo1"),
  );
  calendar.repositories.set(
    "https://github.com/test/repo2",
    new Repository("https://github.com/test/repo2"),
  );

  const urls = [...calendar.repoUrls()];
  urls.sort();
  assertEquals(urls, [
    "https://github.com/test/repo1",
    "https://github.com/test/repo2",
  ]);
});

Deno.test("Calendar should calculate max contributions", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 10),
    new Day(new Date(2025, 0, 3), 3),
  ];
  const calendar = new Calendar("testuser", days);
  calendar.updateRepoCounts();
  assertEquals(calendar.maxContributions(), 10);
});

Deno.test("Calendar.updateRepoCounts() should clear stale unknown repo", () => {
  // Simulates progressive loading: summary arrives first (all contributions
  // appear unknown), then specific events arrive that account for everything.
  const calendar = new Calendar("testuser");
  const date = new Date(2025, 0, 1);
  calendar.day(date).contributionCount = 5;

  // First call: summary only, no specific repos yet.
  calendar.updateRepoCounts();

  // Add specific events that account for all contributions.
  calendar.repoDay(date, "repo1").setCommits(5);

  // Second call: should clear the stale "unknown" RepositoryDay.
  calendar.updateRepoCounts();

  const day = calendar.day(date);
  assertEquals(day.unknownCount(), 0);
  assertEquals(day.repositories.has("unknown"), false);
});

Deno.test("Calendar should sort repos by contribution count", () => {
  const calendar = new Calendar("testuser");
  const date = new Date(2025, 0, 1);
  calendar.repoDay(date, "repo1").setCommits(5);
  calendar.repoDay(date, "repo2").setCommits(10);
  calendar.repoDay(date, "repo3").setCommits(3);
  calendar.updateRepoCounts();

  const sorted = calendar.mostUsedRepos().map((repo) =>
    `${repo.url} ${repo.contributions}`
  );
  assertEquals(sorted, [
    "repo2 10",
    "repo1 5",
    "repo3 3",
  ]);
});

Deno.test("Calendar should assign distinct hues to repos by usage", () => {
  const calendar = new Calendar("testuser");
  const date = new Date(2025, 0, 1);

  const repo1 = new Repository("https://github.com/test/repo1");
  calendar.repositories.set(repo1.url, repo1);
  calendar.repoDay(date, repo1.url).setCommits(10);

  const repo2 = new Repository("https://github.com/test/repo2");
  calendar.repositories.set(repo2.url, repo2);
  calendar.repoDay(date, repo2.url).setCommits(5);

  const repo3 = new Repository("https://github.com/test/repo3");
  calendar.repositories.set(repo3.url, repo3);
  calendar.repoDay(date, repo3.url).setCommits(3);

  calendar.updateRepoCounts();
  calendar.updateRepoColors();

  assertEquals(repo1.hue, 285);
  assertEquals(repo2.hue, 340);
  assertEquals(repo3.hue, 35);
});

Deno.test("Calendar should wrap hues around 360 degrees", () => {
  const calendar = new Calendar("testuser");

  for (let i = 0; i < 10; i++) {
    const repo = new Repository(`https://github.com/test/repo${i}`);
    repo.contributions = 10 - i;
    calendar.repositories.set(repo.url, repo);
  }

  calendar.updateRepoColors();

  const repos = calendar.mostUsedRepos();
  assertEquals(repos[7].hue, (285 + 55 * 7) % 360);
});

Deno.test("Calendar should deduplicate repositories", () => {
  const calendar = new Calendar("testuser");
  const repoData = {
    url: "https://github.com/test/repo",
    isFork: false,
    isPrivate: false,
  } as gql.Repository;

  const repo1 = calendar.internRepository(repoData);
  const repo2 = calendar.internRepository(repoData);

  assertStrictEquals(repo1, repo2);
  assertEquals(calendar.repositories.size, 1);
});

/**
 * Check that a week has 7 sequential days starting with `startDate`, a Sunday.
 */
function assertWeek(week: Day[], startDate: Date, msg = "") {
  let prefix = "";
  if (msg.length > 0) {
    prefix = `${msg}: `;
  }

  assertEquals(week.length, 7, `${prefix}week has 7 days`);

  const date = new Date(week[0].date);
  assertEquals(date, startDate, `${prefix}week starts ${startDate.toString()}`);
  assertEquals(date.getDay(), 0, `${prefix}week starts on Sunday`);
  week.forEach((day, i) => {
    assertEquals(
      day.date,
      date,
      `${prefix}day ${i} must equal day ${i - 1} + 1`,
    );
    date.setDate(date.getDate() + 1);
  });
}

/**
 * Check that there are `count` valid, sequential weeks in `weeks`.
 */
function assertWeeks(weeks: Day[][], count: number, startDate: Date, msg = "") {
  let prefix = "";
  if (msg.length > 0) {
    prefix = `${msg}: `;
  }

  assertEquals(weeks.length, count, `${prefix}has ${count} weeks`);
  if (count == 0) {
    return;
  }

  const sunday = new Date(startDate);
  weeks.forEach((week, i) => {
    assertWeek(week, sunday, `${prefix}week ${i}`);
    sunday.setDate(sunday.getDate() + 7);
  });
}

/**
 * Convert weeks to contributions.
 */
function weeksToContributions(weeks: Day[][]): (number | null)[][] {
  return weeks.map((week) => week.map((day) => day.contributionCount));
}

/**
 * Check that there are `count` valid, sequential weeks in `weeks`.
 */
function assertWeeksContributions(
  weeks: Day[][],
  startDate: Date,
  contributions: (number | null)[][],
  msg = "",
) {
  let prefix = "";
  if (msg.length > 0) {
    prefix = `${msg}: `;
  }

  assertWeeks(weeks, contributions.length, startDate, msg);
  assertEquals(
    weeksToContributions(weeks),
    contributions,
    `${prefix}expected contributions`,
  );
}

Deno.test("Calendar.weeks() should returns 7 day weeks", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  assertEquals(days[0].date.getDay(), 3);

  const calendar = new Calendar("testuser", days);
  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, null, 5, 3, 2, null],
  ]);
});

Deno.test("Calendar.weeks() should return 7 day weeks after prepending", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  assertEquals(days[0].date.getDay(), 3);

  const calendar = new Calendar("testuser", days);
  const day = calendar.day(new Date(2024, 11, 28));
  day.contributionCount = 7;

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, null, null, null, null, 7],
    [null, null, null, 5, 3, 2, null],
  ]);
});

Deno.test("Calendar.day() should return existing day when in range", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  const calendar = new Calendar("testuser", days);

  const day = calendar.day(new Date(2025, 0, 2));
  assertStrictEquals(day, days[1]);
  assertEquals(day.contributionCount, 3);
});

Deno.test("Calendar.day() should create day when calendar is empty", () => {
  const calendar = new Calendar("testuser");
  const wednesday = new Date(2025, 0, 1);
  assertEquals(wednesday.getDay(), 3);

  const day = calendar.day(wednesday);
  assertEquals(day.date, wednesday);
  day.contributionCount = 9;

  const dayAgain = calendar.day(wednesday);
  assertStrictEquals(day, dayAgain);
  assertEquals(dayAgain.contributionCount, 9);
});

Deno.test("Calendar.day() should handle earlier day in the initial week", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.day(new Date(2024, 11, 30)).contributionCount = 3;

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, 3, null, 10, null, null, null],
  ]);
});

Deno.test("Calendar.day() should handle later day in the initial week", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.day(new Date(2025, 0, 3)).contributionCount = 3;

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, null, 10, null, 3, null],
  ]);
});

Deno.test("Calendar.day() should prepend days before initial week", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.day(new Date(2024, 11, 24)).contributionCount = 3;

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, 3, null, null, null, null],
    [null, null, null, 10, null, null, null],
  ]);
});

Deno.test("Calendar.day() should append days after initial week", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.day(new Date(2025, 0, 10)).contributionCount = 3;

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, null, 10, null, null, null],
    [null, null, null, null, null, 3, null],
  ]);
});

Deno.test("Calendar.normalizeDays() can prepend days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.normalizeDays([new Day(new Date(2024, 11, 24), 3)]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, 3, null, null, null, null],
    [null, null, null, 10, null, null, null],
  ]);
});

Deno.test("Calendar.normalizeDays() can append days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.normalizeDays([new Day(new Date(2025, 0, 10), 3)]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, null, 10, null, null, null],
    [null, null, null, null, null, 3, null],
  ]);
});

Deno.test("Calendar.normalizeDays() can prepend and append days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.normalizeDays([
    new Day(new Date(2024, 11, 24), 1),
    new Day(new Date(2025, 0, 10), 3),
  ]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, 1, null, null, null, null],
    [null, null, null, 10, null, null, null],
    [null, null, null, null, null, 3, null],
  ]);
});

Deno.test("Calendar.normalizeDays() updates days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
    new Day(new Date(2025, 0, 2), 11),
    new Day(new Date(2025, 0, 3), 12),
  ]);
  calendar.repoDay(new Date(2025, 0, 1), "test-repo").commitCount = 1;
  calendar.normalizeDays([
    new Day(new Date(2024, 11, 31), 1),
    new Day(new Date(2025, 0, 1), 2),
  ]);

  const weeks = [...calendar.weeks()];
  assertWeeksContributions(weeks, new Date(2024, 11, 29), [
    [null, null, 1, 2, 11, 12, null],
  ]);

  assertEquals(
    weeks[0][3].repositories.get("test-repo")?.commitCount,
    1,
    "Must not update details",
  );
});

Deno.test("Calendar.normalizeDays() can accept out-of-order days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 3), 12),
    new Day(new Date(2025, 0, 1), 10),
    new Day(new Date(2025, 0, 2), 11),
  ]);
  calendar.normalizeDays([
    new Day(new Date(2025, 0, 1), 2),
    new Day(new Date(2024, 11, 31), 1),
    new Day(new Date(2025, 0, 5), 5),
  ]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, 1, 2, 11, 12, null],
    [5, null, null, null, null, null, null],
  ]);
});
