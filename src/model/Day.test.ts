import { assert, assertEquals } from "@std/assert";
import { Day, Filter, Repository, RepositoryDay } from "./index.ts";

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

Deno.test("Day.unknownCount() is correct when 0", () => {
  const day = new Day(new Date(2025, 0, 15), 5);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assertEquals(day.unknownCount(), 0);
});

Deno.test("Day.unknownCount() is correct when less than 0", () => {
  // Sometimes there is no summary data, but there is specific data.
  const day = new Day(new Date(2025, 0, 15), null);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assertEquals(day.unknownCount(), -5);
});

Deno.test("Day.unknownCount() is correct when greater than 0", () => {
  const day = new Day(new Date(2025, 0, 15), 10);
  const repoDay = testRepoDay();
  repoDay.addCommits(5);
  day.repositories.set(repoDay.url(), repoDay);

  assertEquals(day.unknownCount(), 5);
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

Deno.test("Day.filteredCount() should only include filtered repos", () => {
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

Deno.test("Day.filteredCount() should include unknowns", () => {
  const day = new Day(new Date(2025, 0, 15), 9);
  const repo1 = new Repository("https://github.com/test/repo1");
  const repo2 = new Repository("https://github.com/test/repo2");

  const repoDay1 = new RepositoryDay(repo1);
  repoDay1.addCommits(3);
  day.repositories.set(repo1.url, repoDay1);

  const repoDay2 = new RepositoryDay(repo2);
  repoDay2.addCommits(5);
  day.repositories.set(repo2.url, repoDay2);

  const filter = Filter.withOnlyRepos(repo1.url);
  assertEquals(day.filteredCount(filter), 4);
});

Deno.test("Day should check if day has specific repo", () => {
  const day = new Day(new Date(2025, 0, 15));
  const repo = new Repository("https://github.com/test/repo");
  day.repositories.set(repo.url, new RepositoryDay(repo));

  assert(day.hasRepo("https://github.com/test/repo"));
  assert(!day.hasRepo("https://github.com/other/repo"));
});
