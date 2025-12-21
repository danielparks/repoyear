import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { Calendar, Day, Filter, Repository, RepositoryDay } from "./model.ts";
import * as gql from "./github/gql.ts";

Deno.test("Filter should be on by default for any repo", () => {
  const filter = new Filter();
  assert(filter.isOn("https://github.com/test/repo"));
  assert(filter.isOn("https://github.com/another/repo"));
});

Deno.test("Filter should create filter with only specified repos", () => {
  const filter = Filter.withOnlyRepos(
    "https://github.com/test/repo1",
    "https://github.com/test/repo2",
  );

  assert(filter.isOn("https://github.com/test/repo1"));
  assert(filter.isOn("https://github.com/test/repo2"));
  assert(!filter.isOn("https://github.com/other/repo"));
});

Deno.test("Filter should switch repo on/off", () => {
  const filter = new Filter();
  assert(filter.isOn("https://github.com/test/repo"));

  filter.switchRepo("https://github.com/test/repo", false);
  assert(!filter.isOn("https://github.com/test/repo"));

  filter.switchRepo("https://github.com/test/repo", true);
  assert(filter.isOn("https://github.com/test/repo"));
});

Deno.test("Filter should clone with same state", () => {
  const filter = new Filter();
  filter.defaultState = false;
  filter.switchRepo("https://github.com/test/repo", true);

  const cloned = filter.clone();
  assert(!cloned.defaultState);
  assert(cloned.isOn("https://github.com/test/repo"));
  assert(!cloned.isOn("https://github.com/other/repo"));
});

Deno.test("Filter should not affect original when cloning", () => {
  const filter = new Filter();
  filter.switchRepo("https://github.com/test/repo", false);

  const cloned = filter.clone();
  cloned.switchRepo("https://github.com/test/repo", true);

  assert(!filter.isOn("https://github.com/test/repo"));
  assert(cloned.isOn("https://github.com/test/repo"));
});

function testRepoDay() {
  return new RepositoryDay(new Repository("https://github.com/test/repo"));
}

Deno.test("RepositoryDay should start with zero counts", () => {
  const repoDay = testRepoDay();
  assertEquals(repoDay.commitCount, 0);
  assertEquals(repoDay.created, 0);
  assertEquals(repoDay.issues, new Set());
  assertEquals(repoDay.prs, new Set());
  assertEquals(repoDay.reviews, new Set());
  assertEquals(repoDay.count(), 0);
});

Deno.test("RepositoryDay should add commits", () => {
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  assertEquals(repoDay.commitCount, 5);
  assertEquals(repoDay.count(), 5);
});

Deno.test("RepositoryDay should add multiple commits", () => {
  const repoDay = testRepoDay();
  repoDay.addCommits(3);
  repoDay.addCommits(2);
  assertEquals(repoDay.commitCount, 5);
  assertEquals(repoDay.count(), 5);
});

Deno.test("RepositoryDay should add repository creation", () => {
  const repoDay = testRepoDay();
  repoDay.addCreate();
  assertEquals(repoDay.created, 1);
  assertEquals(repoDay.count(), 1);
});

Deno.test("RepositoryDay should count all contribution types", () => {
  const repoDay = testRepoDay();
  repoDay.addCommits(3);
  repoDay.addCreate();
  repoDay.issues.add("https://github.com/test/repo/issues/1");
  repoDay.issues.add("https://github.com/test/repo/issues/2");
  repoDay.prs.add("https://github.com/test/repo/pull/1");
  repoDay.reviews.add("https://github.com/test/repo/pull/1#review");

  assertEquals(repoDay.count(), 8);
});

Deno.test("Day should calculate known contribution count", () => {
  const day = new Day(new Date(2025, 0, 15), 10);
  const repo1 = new Repository("https://github.com/test/repo1");
  const repo2 = new Repository("https://github.com/test/repo2");

  const repoDay1 = new RepositoryDay(repo1);
  repoDay1.addCommits(3);
  day.repositories.set(repo1.url, repoDay1);

  const repoDay2 = new RepositoryDay(repo2);
  repoDay2.addCommits(2);
  repoDay2.issues.add("https://github.com/test/repo2/issues/1");
  day.repositories.set(repo2.url, repoDay2);

  assertEquals(day.knownContributionCount(), 6);
});

Deno.test("Day should check if contributions add up", () => {
  const day = new Day(new Date(2025, 0, 15), 5);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assert(day.addsUp());
});

Deno.test("Day should return false when contributions don't add up", () => {
  const day = new Day(new Date(2025, 0, 15), 10);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assert(!day.addsUp());
});

Deno.test("Day should filter repositories by filter", () => {
  const day = new Day(new Date(2025, 0, 15));
  const repo1 = new Repository("https://github.com/test/repo1");
  const repo2 = new Repository("https://github.com/test/repo2");

  day.repositories.set(repo1.url, new RepositoryDay(repo1));
  day.repositories.set(repo2.url, new RepositoryDay(repo2));

  const filter = Filter.withOnlyRepos(repo1.url);
  const filtered = day.filteredRepos(filter);

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].url(), repo1.url);
});

Deno.test("Day should calculate filtered count", () => {
  const day = new Day(new Date(2025, 0, 15));
  const repo1 = new Repository("https://github.com/test/repo1");
  const repo2 = new Repository("https://github.com/test/repo2");

  const repoDay1 = new RepositoryDay(repo1);
  repoDay1.addCommits(3);
  day.repositories.set(repo1.url, repoDay1);

  const repoDay2 = new RepositoryDay(repo2);
  repoDay2.addCommits(5);
  day.repositories.set(repo2.url, repoDay2);

  const filter = Filter.withOnlyRepos(repo1.url);
  assertEquals(day.filteredCount(filter), 3);
});

Deno.test("Day should check if day has specific repo", () => {
  const day = new Day(new Date(2025, 0, 15));
  const repo = new Repository("https://github.com/test/repo");
  day.repositories.set(repo.url, new RepositoryDay(repo));

  assert(day.hasRepo("https://github.com/test/repo"));
  assert(!day.hasRepo("https://github.com/other/repo"));
});

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
  assertEquals(calendar.maxContributions(), 10);
});

Deno.test("Calendar should sort repos by contribution count", () => {
  const calendar = new Calendar("testuser");

  const repo1 = new Repository("https://github.com/test/repo1");
  repo1.contributions = 5;
  calendar.repositories.set(repo1.url, repo1);

  const repo2 = new Repository("https://github.com/test/repo2");
  repo2.contributions = 10;
  calendar.repositories.set(repo2.url, repo2);

  const repo3 = new Repository("https://github.com/test/repo3");
  repo3.contributions = 3;
  calendar.repositories.set(repo3.url, repo3);

  const sorted = calendar.mostUsedRepos().map((repo) => repo.url);
  assertEquals(sorted, [
    "https://github.com/test/repo2",
    "https://github.com/test/repo1",
    "https://github.com/test/repo3",
  ]);
});

Deno.test("Calendar should assign distinct hues to repos by usage", () => {
  const calendar = new Calendar("testuser");

  const repo1 = new Repository("https://github.com/test/repo1");
  repo1.contributions = 10;
  calendar.repositories.set(repo1.url, repo1);

  const repo2 = new Repository("https://github.com/test/repo2");
  repo2.contributions = 5;
  calendar.repositories.set(repo2.url, repo2);

  const repo3 = new Repository("https://github.com/test/repo3");
  repo3.contributions = 3;
  calendar.repositories.set(repo3.url, repo3);

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

  const repo1 = calendar.cleanRepository(repoData);
  const repo2 = calendar.cleanRepository(repoData);

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

Deno.test("Calendar.updateSummary() can prepend days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.updateSummary([new Day(new Date(2024, 11, 24), 3)]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, 3, null, null, null, null],
    [null, null, null, 10, null, null, null],
  ]);
});

Deno.test("Calendar.updateSummary() can append days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.updateSummary([new Day(new Date(2025, 0, 10), 3)]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, null, 10, null, null, null],
    [null, null, null, null, null, 3, null],
  ]);
});

Deno.test("Calendar.updateSummary() can prepend and append days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
  ]);
  calendar.updateSummary([
    new Day(new Date(2024, 11, 24), 1),
    new Day(new Date(2025, 0, 10), 3),
  ]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 22), [
    [null, null, 1, null, null, null, null],
    [null, null, null, 10, null, null, null],
    [null, null, null, null, null, 3, null],
  ]);
});

Deno.test("Calendar.updateSummary() updates days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 1), 10),
    new Day(new Date(2025, 0, 2), 11),
    new Day(new Date(2025, 0, 3), 12),
  ]);
  calendar.repoDay(new Date(2025, 0, 1), "test-repo").commitCount = 1;
  calendar.updateSummary([
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

Deno.test("Calendar.updateSummary() can accept out-of-order days", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 3), 12),
    new Day(new Date(2025, 0, 1), 10),
    new Day(new Date(2025, 0, 2), 11),
  ]);
  calendar.updateSummary([
    new Day(new Date(2025, 0, 1), 2),
    new Day(new Date(2024, 11, 31), 1),
    new Day(new Date(2025, 0, 5), 5),
  ]);

  assertWeeksContributions([...calendar.weeks()], new Date(2024, 11, 29), [
    [null, null, 1, 2, 11, 12, null],
    [5, null, null, null, null, null, null],
  ]);
});
