import { assertEquals, assertStrictEquals } from "@std/assert";
import { Calendar, Day, Filter, Repository, RepositoryDay } from "./model.ts";
import * as gql from "./github/gql.ts";

Deno.test("Filter", async (t) => {
  await t.step("should be on by default for any repo", () => {
    const filter = new Filter();
    assertEquals(filter.isOn("https://github.com/test/repo"), true);
    assertEquals(filter.isOn("https://github.com/another/repo"), true);
  });

  await t.step("should create filter with only specified repos", () => {
    const filter = Filter.withOnlyRepos(
      "https://github.com/test/repo1",
      "https://github.com/test/repo2",
    );

    assertEquals(filter.isOn("https://github.com/test/repo1"), true);
    assertEquals(filter.isOn("https://github.com/test/repo2"), true);
    assertEquals(filter.isOn("https://github.com/other/repo"), false);
  });

  await t.step("should switch repo on/off", () => {
    const filter = new Filter();
    filter.switchRepo("https://github.com/test/repo", false);
    assertEquals(filter.isOn("https://github.com/test/repo"), false);

    filter.switchRepo("https://github.com/test/repo", true);
    assertEquals(filter.isOn("https://github.com/test/repo"), true);
  });

  await t.step("should clone with same state", () => {
    const filter = new Filter();
    filter.defaultState = false;
    filter.switchRepo("https://github.com/test/repo", true);

    const cloned = filter.clone();
    assertEquals(cloned.defaultState, false);
    assertEquals(cloned.isOn("https://github.com/test/repo"), true);
    assertEquals(cloned.isOn("https://github.com/other/repo"), false);
  });

  await t.step("should not affect original when cloning", () => {
    const filter = new Filter();
    filter.switchRepo("https://github.com/test/repo", false);

    const cloned = filter.clone();
    cloned.switchRepo("https://github.com/test/repo", true);

    assertEquals(filter.isOn("https://github.com/test/repo"), false);
    assertEquals(cloned.isOn("https://github.com/test/repo"), true);
  });
});

Deno.test("Repository", async (t) => {
  await t.step("should create repository with URL", () => {
    const repo = new Repository("https://github.com/test/repo");
    assertEquals(repo.url, "https://github.com/test/repo");
    assertEquals(repo.isFork, false);
    assertEquals(repo.isPrivate, false);
    assertEquals(repo.contributions, 0);
  });

  await t.step("should create repository with fork and private flags", () => {
    const repo = new Repository(
      "https://github.com/test/repo",
      true,
      true,
    );
    assertEquals(repo.isFork, true);
    assertEquals(repo.isPrivate, true);
  });

  await t.step("should generate OKLCH color string", () => {
    const repo = new Repository("https://github.com/test/repo");
    repo.hue = 120;
    const color = repo.color(55, 0.2);
    assertEquals(color, "oklch(55% 0.2 120deg)");
  });

  await t.step("should use default lightness and chroma", () => {
    const repo = new Repository("https://github.com/test/repo");
    repo.hue = 180;
    const color = repo.color();
    assertEquals(color, "oklch(55% 0.2 180deg)");
  });
});

Deno.test("RepositoryDay", async (t) => {
  const repo = new Repository("https://github.com/test/repo");

  await t.step("should start with zero counts", () => {
    const repoDay = new RepositoryDay(repo);
    assertEquals(repoDay.commitCount, 0);
    assertEquals(repoDay.created, 0);
    assertEquals(repoDay.issues, []);
    assertEquals(repoDay.prs, []);
    assertEquals(repoDay.reviews, []);
    assertEquals(repoDay.count(), 0);
  });

  await t.step("should add commits", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    assertEquals(repoDay.commitCount, 5);
    assertEquals(repoDay.count(), 5);
  });

  await t.step("should add multiple commits", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(3);
    repoDay.addCommits(2);
    assertEquals(repoDay.commitCount, 5);
    assertEquals(repoDay.count(), 5);
  });

  await t.step("should add repository creation", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCreate();
    assertEquals(repoDay.created, 1);
    assertEquals(repoDay.count(), 1);
  });

  await t.step("should count all contribution types", () => {
    const repoDay = new RepositoryDay(repo);
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

  await t.step("should return repository URL", () => {
    const repoDay = new RepositoryDay(repo);
    assertEquals(repoDay.url(), "https://github.com/test/repo");
  });
});

Deno.test("Day", async (t) => {
  const date = new Date(2025, 0, 15);

  await t.step("should create day with date", () => {
    const day = new Day(date);
    assertStrictEquals(day.date, date);
    assertEquals(day.contributionCount, null);
    assertEquals(day.repositories.size, 0);
  });

  await t.step("should create day with contribution count", () => {
    const day = new Day(date, 5);
    assertEquals(day.contributionCount, 5);
  });

  await t.step("should calculate known contribution count", () => {
    const day = new Day(date, 10);
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

  await t.step("should check if contributions add up", () => {
    const day = new Day(date, 5);
    const repo = new Repository("https://github.com/test/repo");
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    day.repositories.set(repo.url, repoDay);

    assertEquals(day.addsUp(), true);
  });

  await t.step("should return false when contributions don't add up", () => {
    const day = new Day(date, 10);
    const repo = new Repository("https://github.com/test/repo");
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    day.repositories.set(repo.url, repoDay);

    assertEquals(day.addsUp(), false);
  });

  await t.step("should filter repositories by filter", () => {
    const day = new Day(date);
    const repo1 = new Repository("https://github.com/test/repo1");
    const repo2 = new Repository("https://github.com/test/repo2");

    day.repositories.set(repo1.url, new RepositoryDay(repo1));
    day.repositories.set(repo2.url, new RepositoryDay(repo2));

    const filter = Filter.withOnlyRepos(repo1.url);
    const filtered = day.filteredRepos(filter);

    assertEquals(filtered.length, 1);
    assertEquals(filtered[0].url(), repo1.url);
  });

  await t.step("should calculate filtered count", () => {
    const day = new Day(date);
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

  await t.step("should check if day has specific repo", () => {
    const day = new Day(date);
    const repo = new Repository("https://github.com/test/repo");
    day.repositories.set(repo.url, new RepositoryDay(repo));

    assertEquals(day.hasRepo("https://github.com/test/repo"), true);
    assertEquals(day.hasRepo("https://github.com/other/repo"), false);
  });
});

Deno.test("Calendar", async (t) => {
  const startDate = new Date(2025, 0, 1);

  await t.step("should create calendar with name and start date", () => {
    const calendar = new Calendar("testuser", startDate);
    assertEquals(calendar.name, "testuser");
    assertStrictEquals(calendar.start, startDate);
    assertEquals(calendar.days, []);
    assertEquals(calendar.repositories.size, 0);
  });

  await t.step("should create calendar with days", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 3),
    ];
    const calendar = new Calendar("testuser", startDate, days);
    assertEquals(calendar.days.length, 2);
  });

  await t.step("should get day by date", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 3),
      new Day(new Date(2025, 0, 3), 2),
    ];
    const calendar = new Calendar("testuser", startDate, days);

    const day = calendar.day(new Date(2025, 0, 2));
    assertEquals(day?.contributionCount, 3);
  });

  await t.step("should return repository URLs", () => {
    const calendar = new Calendar("testuser", startDate);
    calendar.repositories.set(
      "https://github.com/test/repo1",
      new Repository("https://github.com/test/repo1"),
    );
    calendar.repositories.set(
      "https://github.com/test/repo2",
      new Repository("https://github.com/test/repo2"),
    );

    const urls = [...calendar.repoUrls()];
    assertEquals(urls.includes("https://github.com/test/repo1"), true);
    assertEquals(urls.includes("https://github.com/test/repo2"), true);
    assertEquals(urls.length, 2);
  });

  await t.step("should calculate max contributions", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 10),
      new Day(new Date(2025, 0, 3), 3),
    ];
    const calendar = new Calendar("testuser", startDate, days);
    assertEquals(calendar.maxContributions(), 10);
  });

  await t.step("should sort repos by contribution count", () => {
    const calendar = new Calendar("testuser", startDate);

    const repo1 = new Repository("https://github.com/test/repo1");
    repo1.contributions = 5;
    calendar.repositories.set(repo1.url, repo1);

    const repo2 = new Repository("https://github.com/test/repo2");
    repo2.contributions = 10;
    calendar.repositories.set(repo2.url, repo2);

    const repo3 = new Repository("https://github.com/test/repo3");
    repo3.contributions = 3;
    calendar.repositories.set(repo3.url, repo3);

    const sorted = calendar.mostUsedRepos();
    assertEquals(sorted[0].url, "https://github.com/test/repo2");
    assertEquals(sorted[1].url, "https://github.com/test/repo1");
    assertEquals(sorted[2].url, "https://github.com/test/repo3");
  });

  await t.step("should assign distinct hues to repos by usage", () => {
    const calendar = new Calendar("testuser", startDate);

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

  await t.step("should wrap hues around 360 degrees", () => {
    const calendar = new Calendar("testuser", startDate);

    for (let i = 0; i < 10; i++) {
      const repo = new Repository(`https://github.com/test/repo${i}`);
      repo.contributions = 10 - i;
      calendar.repositories.set(repo.url, repo);
    }

    calendar.updateRepoColors();

    const repos = calendar.mostUsedRepos();
    assertEquals(repos[7].hue, (285 + 55 * 7) % 360);
  });

  await t.step("should deduplicate repositories", () => {
    const calendar = new Calendar("testuser", startDate);
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
});
