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
  assertEquals(repoDay.issues, []);
  assertEquals(repoDay.prs, []);
  assertEquals(repoDay.reviews, []);
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
  repoDay.issues.push(
    "https://github.com/test/repo/issues/1",
    "https://github.com/test/repo/issues/2",
  );
  repoDay.prs.push("https://github.com/test/repo/pull/1");
  repoDay.reviews.push("https://github.com/test/repo/pull/1#review");

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
  repoDay2.issues.push("https://github.com/test/repo2/issues/1");
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

Deno.test("Calendar should get day by date", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  const calendar = new Calendar("testuser", days);

  const day = calendar.day(new Date(2025, 0, 2));
  assertEquals(day?.contributionCount, 3);
});

Deno.test("Calendar should start first week on Sunday", () => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  assertEquals(days[0].date.getDay(), 3);

  const calendar = new Calendar("testuser", days);
  calendar.day(new Date(2024, 11, 28));

  const weeks = [...calendar.weeks()];
  assertEquals(weeks.length, 2);
  assertEquals(weeks[0].length, 7);

  const sunday = weeks[0][0];
  assertEquals(sunday.date, new Date(2024, 11, 22), "first day date");
  assertEquals(sunday.date.getDay(), 0, "first day should be Sunday");
  assertEquals(sunday.contributionCount, null, "first day contributions");

  const saturday = weeks[0][weeks[0].length - 1];
  assertEquals(saturday.date, new Date(2024, 11, 28), "last day date");
  assertEquals(saturday.date.getDay(), 6, "last day should be Saturday");
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

Deno.test("Calendar.day() should create day when calendar is empty", () => {
  const calendar = new Calendar("testuser");
  const wednesday = new Date(2025, 0, 1);
  assertEquals(wednesday.getDay(), 3);

  const day = calendar.day(wednesday);
  assertEquals(day.date, wednesday);

  assertEquals(calendar.days[0].date.getDay(), 0);
  assertEquals(calendar.days[0].date, new Date(2024, 11, 29));
});

Deno.test("Calendar.day() should prepend days before first day", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 5), 5),
  ]);
  assertEquals(calendar.days[0].date.getDay(), 0);

  const day = calendar.day(new Date(2025, 0, 2));
  assertEquals(day.date, new Date(2025, 0, 2));

  assertEquals(calendar.days[0].date.getDay(), 0);
  assertEquals(calendar.days[0].date, new Date(2024, 11, 29));
});

Deno.test("Calendar.day() should append days after last day", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 5), 5),
  ]);

  const day = calendar.day(new Date(2025, 0, 10));
  assertEquals(day.date, new Date(2025, 0, 10));

  assertEquals(calendar.days[0].date.getDay(), 0);
  assertEquals(
    calendar.days[calendar.days.length - 1].date,
    new Date(2025, 0, 10),
  );
});

Deno.test("Calendar.day() should maintain Sunday start when prepending", () => {
  const calendar = new Calendar("testuser", [
    new Day(new Date(2025, 0, 8), 5),
  ]);
  assertEquals(calendar.days[0].date.getDay(), 3);

  calendar.day(new Date(2025, 0, 1));

  assertEquals(calendar.days[0].date.getDay(), 0);
  assertEquals(calendar.days[0].date, new Date(2024, 11, 29));
});

Deno.test("Calendar.weeks() should yield complete weeks without padding", () => {
  const calendar = new Calendar("testuser");
  calendar.day(new Date(2025, 0, 1));
  calendar.day(new Date(2025, 0, 14));

  const weeks = [...calendar.weeks()];
  assertEquals(weeks.length, 3);

  assertEquals(weeks[0].length, 7);
  assertEquals(weeks[0][0].date.getDay(), 0);
  assertEquals(weeks[0][0].date, new Date(2024, 11, 29));

  assertEquals(weeks[1].length, 7);
  assertEquals(weeks[1][0].date.getDay(), 0);

  assertEquals(weeks[2].length, 3);
  assertEquals(weeks[2][0].date.getDay(), 0);
});

Deno.test("Calendar.day() should return existing day when in range", () => {
  const existingDay = new Day(new Date(2025, 0, 5), 10);
  const calendar = new Calendar("testuser", [existingDay]);

  const day = calendar.day(new Date(2025, 0, 5));
  assertStrictEquals(day, existingDay);
  assertEquals(day.contributionCount, 10);
});
