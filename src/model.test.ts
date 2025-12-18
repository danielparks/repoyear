import { describe, expect, it } from "vitest";
import { Calendar, Day, Filter, Repository, RepositoryDay } from "./model.ts";
import * as gql from "./github/gql.ts";

describe("Filter", () => {
  it("should be on by default for any repo", () => {
    const filter = new Filter();
    expect(filter.isOn("https://github.com/test/repo")).toBe(true);
    expect(filter.isOn("https://github.com/another/repo")).toBe(true);
  });

  it("should create filter with only specified repos", () => {
    const filter = Filter.withOnlyRepos(
      "https://github.com/test/repo1",
      "https://github.com/test/repo2",
    );

    expect(filter.isOn("https://github.com/test/repo1")).toBe(true);
    expect(filter.isOn("https://github.com/test/repo2")).toBe(true);
    expect(filter.isOn("https://github.com/other/repo")).toBe(false);
  });

  it("should switch repo on/off", () => {
    const filter = new Filter();
    filter.switchRepo("https://github.com/test/repo", false);
    expect(filter.isOn("https://github.com/test/repo")).toBe(false);

    filter.switchRepo("https://github.com/test/repo", true);
    expect(filter.isOn("https://github.com/test/repo")).toBe(true);
  });

  it("should clone with same state", () => {
    const filter = new Filter();
    filter.defaultState = false;
    filter.switchRepo("https://github.com/test/repo", true);

    const cloned = filter.clone();
    expect(cloned.defaultState).toBe(false);
    expect(cloned.isOn("https://github.com/test/repo")).toBe(true);
    expect(cloned.isOn("https://github.com/other/repo")).toBe(false);
  });

  it("should not affect original when cloning", () => {
    const filter = new Filter();
    filter.switchRepo("https://github.com/test/repo", false);

    const cloned = filter.clone();
    cloned.switchRepo("https://github.com/test/repo", true);

    expect(filter.isOn("https://github.com/test/repo")).toBe(false);
    expect(cloned.isOn("https://github.com/test/repo")).toBe(true);
  });
});

describe("Repository", () => {
  it("should create repository with URL", () => {
    const repo = new Repository("https://github.com/test/repo");
    expect(repo.url).toBe("https://github.com/test/repo");
    expect(repo.isFork).toBe(false);
    expect(repo.isPrivate).toBe(false);
    expect(repo.contributions).toBe(0);
  });

  it("should create repository with fork and private flags", () => {
    const repo = new Repository(
      "https://github.com/test/repo",
      true,
      true,
    );
    expect(repo.isFork).toBe(true);
    expect(repo.isPrivate).toBe(true);
  });

  it("should generate OKLCH color string", () => {
    const repo = new Repository("https://github.com/test/repo");
    repo.hue = 120;
    const color = repo.color(55, 0.2);
    expect(color).toBe("oklch(55% 0.2 120deg)");
  });

  it("should use default lightness and chroma", () => {
    const repo = new Repository("https://github.com/test/repo");
    repo.hue = 180;
    const color = repo.color();
    expect(color).toBe("oklch(55% 0.2 180deg)");
  });
});

describe("RepositoryDay", () => {
  const repo = new Repository("https://github.com/test/repo");

  it("should start with zero counts", () => {
    const repoDay = new RepositoryDay(repo);
    expect(repoDay.commitCount).toBe(0);
    expect(repoDay.created).toBe(0);
    expect(repoDay.issues).toEqual([]);
    expect(repoDay.prs).toEqual([]);
    expect(repoDay.reviews).toEqual([]);
    expect(repoDay.count()).toBe(0);
  });

  it("should add commits", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    expect(repoDay.commitCount).toBe(5);
    expect(repoDay.count()).toBe(5);
  });

  it("should add multiple commits", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(3);
    repoDay.addCommits(2);
    expect(repoDay.commitCount).toBe(5);
    expect(repoDay.count()).toBe(5);
  });

  it("should add repository creation", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCreate();
    expect(repoDay.created).toBe(1);
    expect(repoDay.count()).toBe(1);
  });

  it("should count all contribution types", () => {
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(3);
    repoDay.addCreate();
    repoDay.issues.push(
      "https://github.com/test/repo/issues/1",
      "https://github.com/test/repo/issues/2",
    );
    repoDay.prs.push("https://github.com/test/repo/pull/1");
    repoDay.reviews.push("https://github.com/test/repo/pull/1#review");

    expect(repoDay.count()).toBe(8);
  });

  it("should return repository URL", () => {
    const repoDay = new RepositoryDay(repo);
    expect(repoDay.url()).toBe("https://github.com/test/repo");
  });
});

describe("Day", () => {
  const date = new Date(2025, 0, 15);

  it("should create day with date", () => {
    const day = new Day(date);
    expect(day.date).toBe(date);
    expect(day.contributionCount).toBe(null);
    expect(day.repositories.size).toBe(0);
  });

  it("should create day with contribution count", () => {
    const day = new Day(date, 5);
    expect(day.contributionCount).toBe(5);
  });

  it("should calculate known contribution count", () => {
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

    expect(day.knownContributionCount()).toBe(6);
  });

  it("should check if contributions add up", () => {
    const day = new Day(date, 5);
    const repo = new Repository("https://github.com/test/repo");
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    day.repositories.set(repo.url, repoDay);

    expect(day.addsUp()).toBe(true);
  });

  it("should return false when contributions don't add up", () => {
    const day = new Day(date, 10);
    const repo = new Repository("https://github.com/test/repo");
    const repoDay = new RepositoryDay(repo);
    repoDay.addCommits(5);
    day.repositories.set(repo.url, repoDay);

    expect(day.addsUp()).toBe(false);
  });

  it("should filter repositories by filter", () => {
    const day = new Day(date);
    const repo1 = new Repository("https://github.com/test/repo1");
    const repo2 = new Repository("https://github.com/test/repo2");

    day.repositories.set(repo1.url, new RepositoryDay(repo1));
    day.repositories.set(repo2.url, new RepositoryDay(repo2));

    const filter = Filter.withOnlyRepos(repo1.url);
    const filtered = day.filteredRepos(filter);

    expect(filtered.length).toBe(1);
    expect(filtered[0].url()).toBe(repo1.url);
  });

  it("should calculate filtered count", () => {
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
    expect(day.filteredCount(filter)).toBe(3);
  });

  it("should check if day has specific repo", () => {
    const day = new Day(date);
    const repo = new Repository("https://github.com/test/repo");
    day.repositories.set(repo.url, new RepositoryDay(repo));

    expect(day.hasRepo("https://github.com/test/repo")).toBe(true);
    expect(day.hasRepo("https://github.com/other/repo")).toBe(false);
  });
});

describe("Calendar", () => {
  const startDate = new Date(2025, 0, 1);

  it("should create calendar with name and start date", () => {
    const calendar = new Calendar("testuser", startDate);
    expect(calendar.name).toBe("testuser");
    expect(calendar.start).toBe(startDate);
    expect(calendar.days).toEqual([]);
    expect(calendar.repositories.size).toBe(0);
  });

  it("should create calendar with days", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 3),
    ];
    const calendar = new Calendar("testuser", startDate, days);
    expect(calendar.days.length).toBe(2);
  });

  it("should get day by date", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 3),
      new Day(new Date(2025, 0, 3), 2),
    ];
    const calendar = new Calendar("testuser", startDate, days);

    const day = calendar.day(new Date(2025, 0, 2));
    expect(day?.contributionCount).toBe(3);
  });

  it("should return repository URLs", () => {
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
    expect(urls).toContain("https://github.com/test/repo1");
    expect(urls).toContain("https://github.com/test/repo2");
    expect(urls.length).toBe(2);
  });

  it("should calculate max contributions", () => {
    const days = [
      new Day(new Date(2025, 0, 1), 5),
      new Day(new Date(2025, 0, 2), 10),
      new Day(new Date(2025, 0, 3), 3),
    ];
    const calendar = new Calendar("testuser", startDate, days);
    expect(calendar.maxContributions()).toBe(10);
  });

  it("should sort repos by contribution count", () => {
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
    expect(sorted[0].url).toBe("https://github.com/test/repo2");
    expect(sorted[1].url).toBe("https://github.com/test/repo1");
    expect(sorted[2].url).toBe("https://github.com/test/repo3");
  });

  it("should assign distinct hues to repos by usage", () => {
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

    expect(repo1.hue).toBe(285);
    expect(repo2.hue).toBe(340);
    expect(repo3.hue).toBe(35);
  });

  it("should wrap hues around 360 degrees", () => {
    const calendar = new Calendar("testuser", startDate);

    for (let i = 0; i < 10; i++) {
      const repo = new Repository(`https://github.com/test/repo${i}`);
      repo.contributions = 10 - i;
      calendar.repositories.set(repo.url, repo);
    }

    calendar.updateRepoColors();

    const repos = calendar.mostUsedRepos();
    expect(repos[7].hue).toBe((285 + 55 * 7) % 360);
  });

  it("should deduplicate repositories", () => {
    const calendar = new Calendar("testuser", startDate);
    const repoData = {
      url: "https://github.com/test/repo",
      isFork: false,
      isPrivate: false,
    } as gql.Repository;

    const repo1 = calendar.cleanRepository(repoData);
    const repo2 = calendar.cleanRepository(repoData);

    expect(repo1).toBe(repo2);
    expect(calendar.repositories.size).toBe(1);
  });
});
