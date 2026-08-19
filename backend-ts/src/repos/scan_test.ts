import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  getDefaultBranch,
  resolveGitDir,
  scanRepo,
  scanRepoPath,
} from "./scan.ts";
import { Home, tempDir } from "../test/fixtures.ts";

Deno.test("scan_repo", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  assertEquals((await scanRepoPath(repo.path)).length, 1);
});

Deno.test("scan_repo_dotgit", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  assertEquals((await scanRepoPath(join(repo.path, ".git"))).length, 1);
});

Deno.test("scan_repo_subdir", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.write("dir/a", "a0");
  await repo.git(["add", "dir/a"]);
  await repo.git(["commit", "-m", "commit 0"]);

  await assertRejects(() => scanRepoPath(join(repo.path, "dir")));
});

Deno.test("scan_nonrepo", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);

  await assertRejects(() => scanRepoPath(home.path));
});

Deno.test("scan_bare_repo", async () => {
  const home = await Home.init(await tempDir());
  const bareRepo = await home.gitInitBare("bare_repo");
  const repo = await bareRepo.clone("repo");
  await repo.makeCommit(0);
  await repo.git(["push"]);

  assertEquals((await scanRepoPath(bareRepo.path)).length, 1);
});

Deno.test("resolveGitDir returns null for a plain directory", async () => {
  const home = await Home.init(await tempDir());
  await Deno.mkdir(join(home.path, "not-a-repo"));
  assertEquals(await resolveGitDir(join(home.path, "not-a-repo")), null);
});

Deno.test("default_branch_prefers_origin_head_over_upstream_head", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0); // main: 1 commit (c0)

  await repo.git(["branch", "upstream-branch"]);
  await repo.git(["checkout", "upstream-branch"]);
  await repo.makeCommit(1); // upstream-branch: 2 commits (c0, c1)

  await repo.git(["branch", "origin-branch"]); // branched from upstream-branch
  await repo.git(["checkout", "origin-branch"]);
  await repo.makeCommit(2); // origin-branch: 3 commits (c0, c1, c2)

  await repo.git(["checkout", "main"]);

  await repo.git([
    "symbolic-ref",
    "refs/remotes/upstream/HEAD",
    "refs/remotes/upstream/upstream-branch",
  ]);
  await repo.git([
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/origin-branch",
  ]);

  // Both origin/HEAD and upstream/HEAD are set, pointing at different
  // (real) branches with different history lengths: origin must win.
  assertEquals((await scanRepoPath(repo.path)).length, 3);
});

Deno.test("default_branch_falls_back_to_upstream_head_over_config", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0); // main: 1 commit (c0)

  await repo.git(["branch", "config-branch"]);
  await repo.git(["checkout", "config-branch"]);
  await repo.makeCommit(1); // config-branch: 2 commits (c0, c1)

  await repo.git(["branch", "upstream-branch"]); // branched from config-branch
  await repo.git(["checkout", "upstream-branch"]);
  await repo.makeCommit(2); // upstream-branch: 3 commits (c0, c1, c2)

  await repo.git(["checkout", "main"]);

  await repo.git(["config", "init.defaultBranch", "config-branch"]);
  await repo.git([
    "symbolic-ref",
    "refs/remotes/upstream/HEAD",
    "refs/remotes/upstream/upstream-branch",
  ]);

  // No origin/HEAD; upstream/HEAD and init.defaultBranch both point at
  // real, different branches: upstream must win over the config.
  assertEquals((await scanRepoPath(repo.path)).length, 3);
});

Deno.test("default_branch_uses_local_config_when_no_remote_head", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0); // main: 1 commit

  await repo.git(["branch", "feature"]);
  await repo.git(["checkout", "feature"]);
  await repo.makeCommit(1); // feature: 2 commits
  await repo.git(["checkout", "main"]);

  await repo.git(["config", "init.defaultBranch", "feature"]);

  assertEquals((await scanRepoPath(repo.path)).length, 2);
});

Deno.test("default_branch_local_config_falls_through_when_branch_missing", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0); // main: 1 commit

  // "ghost" doesn't exist, so this should fall through to `main` rather
  // than erroring.
  await repo.git(["config", "init.defaultBranch", "ghost"]);

  assertEquals((await scanRepoPath(repo.path)).length, 1);
});

Deno.test("default_branch_uses_master_when_no_main", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  await repo.git(["branch", "-m", "main", "master"]);

  // The home's global `init.defaultBranch = main` config still points at a
  // branch that no longer exists, so this exercises the `master` fallback
  // specifically.
  assertEquals((await scanRepoPath(repo.path)).length, 1);
});

Deno.test("default_branch_falls_back_to_head", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  // No `main`, no `master`, and the global `init.defaultBranch = main`
  // config points at a branch that doesn't exist either.
  await repo.git(["branch", "-m", "main", "custom"]);

  assertEquals((await scanRepoPath(repo.path)).length, 1);
});

Deno.test("scan_empty_repo_errors", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  // No commits: HEAD is unborn, and there's no branch to fall back to.
  await assertRejects(() => scanRepoPath(repo.path));
});

Deno.test("scan_repo_uses_author_time_not_committer_time", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.write("a", "a");
  await repo.git(["add", "a"]);
  await repo.git([
    "commit",
    "-m",
    "commit",
    "--date",
    "2000-01-01T00:00:00+00:00",
  ]);

  // If this used committer time instead of author time, it would be ~now,
  // not the fixed date above (946_684_800 = 2000-01-01 UTC).
  assertEquals(await scanRepoPath(repo.path), [946_684_800]);
});

Deno.test("scan_repo_skips_when_origin_is_github_ssh", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  await repo.git([
    "remote",
    "add",
    "origin",
    "git@github.com:example/repo.git",
  ]);

  assertEquals(await scanRepoPath(repo.path), []);
});

Deno.test("scan_repo_skips_when_origin_is_github_https", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  await repo.git([
    "remote",
    "add",
    "origin",
    "https://github.com/example/repo.git",
  ]);

  assertEquals(await scanRepoPath(repo.path), []);
});

Deno.test("scan_repo_returns_history_for_non_github_remote", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  await repo.git([
    "remote",
    "add",
    "origin",
    "https://git.example.com/repo.git",
  ]);

  assertEquals((await scanRepoPath(repo.path)).length, 1);
});

Deno.test("scan_repo_skips_if_any_remote_is_github", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  await repo.git([
    "remote",
    "add",
    "origin",
    "https://git.example.com/repo.git",
  ]);
  await repo.git([
    "remote",
    "add",
    "github",
    "https://github.com/example/repo.git",
  ]);

  // Documents current behavior: a single GitHub remote is enough to skip
  // the whole repo, even if other remotes aren't GitHub.
  assertEquals(await scanRepoPath(repo.path), []);
});

Deno.test("getDefaultBranch throws when nothing resolves", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  const gitDir = join(repo.path, ".git");
  await assertRejects(() => getDefaultBranch(gitDir));
});

Deno.test("scanRepo matches scanRepoPath for an already-resolved git dir", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);
  const gitDir = await resolveGitDir(repo.path);
  assert(gitDir !== null);
  assertEquals((await scanRepo(gitDir)).length, 1);
});
