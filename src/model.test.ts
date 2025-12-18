import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { Calendar, Day, Filter, Repository, RepositoryDay } from "./model.ts";
import * as gql from "./github/gql.ts";

Deno.test("Filter should be on by default for any repo", async (t) => {
  const filter = new Filter();
  assert(filter.isOn("https://github.com/test/repo"));
  assert(filter.isOn("https://github.com/another/repo"));
});

Deno.test("Filter should create filter with only specified repos", async (t) => {
  const filter = Filter.withOnlyRepos(
    "https://github.com/test/repo1",
    "https://github.com/test/repo2",
  );

  assert(filter.isOn("https://github.com/test/repo1"));
  assert(filter.isOn("https://github.com/test/repo2"));
  assert(!filter.isOn("https://github.com/other/repo"));
});

Deno.test("Filter should switch repo on/off", async (t) => {
  const filter = new Filter();
  assert(filter.isOn("https://github.com/test/repo"));

  filter.switchRepo("https://github.com/test/repo", false);
  assert(!filter.isOn("https://github.com/test/repo"));

  filter.switchRepo("https://github.com/test/repo", true);
  assert(filter.isOn("https://github.com/test/repo"));
});

Deno.test("Filter should clone with same state", async (t) => {
  const filter = new Filter();
  filter.defaultState = false;
  filter.switchRepo("https://github.com/test/repo", true);

  const cloned = filter.clone();
  assert(!cloned.defaultState);
  assert(cloned.isOn("https://github.com/test/repo"));
  assert(!cloned.isOn("https://github.com/other/repo"));
});

Deno.test("Filter should not affect original when cloning", async (t) => {
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

Deno.test("RepositoryDay should start with zero counts", async (t) => {
  const repoDay = testRepoDay();
  assertEquals(repoDay.commitCount, 0);
  assertEquals(repoDay.created, 0);
  assertEquals(repoDay.issues, []);
  assertEquals(repoDay.prs, []);
  assertEquals(repoDay.reviews, []);
  assertEquals(repoDay.count(), 0);
});

Deno.test("RepositoryDay should add commits", async (t) => {
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  assertEquals(repoDay.commitCount, 5);
  assertEquals(repoDay.count(), 5);
});

Deno.test("RepositoryDay should add multiple commits", async (t) => {
  const repoDay = testRepoDay();
  repoDay.addCommits(3);
  repoDay.addCommits(2);
  assertEquals(repoDay.commitCount, 5);
  assertEquals(repoDay.count(), 5);
});

Deno.test("RepositoryDay should add repository creation", async (t) => {
  const repoDay = testRepoDay();
  repoDay.addCreate();
  assertEquals(repoDay.created, 1);
  assertEquals(repoDay.count(), 1);
});

Deno.test("RepositoryDay should count all contribution types", async (t) => {
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

Deno.test("Day should calculate known contribution count", async (t) => {
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

Deno.test("Day should check if contributions add up", async (t) => {
  const day = new Day(new Date(2025, 0, 15), 5);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assert(day.addsUp());
});

Deno.test("Day should return false when contributions don't add up", async (t) => {
  const day = new Day(new Date(2025, 0, 15), 10);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assert(!day.addsUp());
});

Deno.test("Day should filter repositories by filter", async (t) => {
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

Deno.test("Day should calculate filtered count", async (t) => {
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

Deno.test("Day should check if day has specific repo", async (t) => {
  const day = new Day(new Date(2025, 0, 15));
  const repo = new Repository("https://github.com/test/repo");
  day.repositories.set(repo.url, new RepositoryDay(repo));

  assert(day.hasRepo("https://github.com/test/repo"));
  assert(!day.hasRepo("https://github.com/other/repo"));
});

Deno.test("Calendar should get day by date", async (t) => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 3),
    new Day(new Date(2025, 0, 3), 2),
  ];
  const calendar = new Calendar("testuser", new Date(2025, 0, 1), days);

  const day = calendar.day(new Date(2025, 0, 2));
  assertEquals(day?.contributionCount, 3);
});

Deno.test("Calendar should return repository URLs", async (t) => {
  const calendar = new Calendar("testuser", new Date(2025, 0, 1));
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

Deno.test("Calendar should calculate max contributions", async (t) => {
  const days = [
    new Day(new Date(2025, 0, 1), 5),
    new Day(new Date(2025, 0, 2), 10),
    new Day(new Date(2025, 0, 3), 3),
  ];
  const calendar = new Calendar("testuser", new Date(2025, 0, 1), days);
  assertEquals(calendar.maxContributions(), 10);
});

Deno.test("Calendar should sort repos by contribution count", async (t) => {
  const calendar = new Calendar("testuser", new Date(2025, 0, 1));

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

Deno.test("Calendar should assign distinct hues to repos by usage", async (t) => {
  const calendar = new Calendar("testuser", new Date(2025, 0, 1));

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

Deno.test("Calendar should wrap hues around 360 degrees", async (t) => {
  const calendar = new Calendar("testuser", new Date(2025, 0, 1));

  for (let i = 0; i < 10; i++) {
    const repo = new Repository(`https://github.com/test/repo${i}`);
    repo.contributions = 10 - i;
    calendar.repositories.set(repo.url, repo);
  }

  calendar.updateRepoColors();

  const repos = calendar.mostUsedRepos();
  assertEquals(repos[7].hue, (285 + 55 * 7) % 360);
});

Deno.test("Calendar should deduplicate repositories", async (t) => {
  const calendar = new Calendar("testuser", new Date(2025, 0, 1));
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
