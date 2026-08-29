import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { type Config, configRepoIter, parseConfig } from "./config.ts";
import { Home, tempDir } from "../test/fixtures.ts";

Deno.test("parseConfig", () => {
  const config = parseConfig(`{
    // a comment, since this is JSONC
    "repos": [
      { "root": "/srv/git", "replaceRoot": "oxidized.org:git" },
      { "root": "/home/daniel/special-repo" },
    ],
  }`);

  assertEquals(config, {
    repos: [
      { root: "/srv/git", replaceRoot: "oxidized.org:git" },
      { root: "/home/daniel/special-repo", replaceRoot: undefined },
    ],
  });
});

/** Get a comparable, sorted summary of everything `configRepoIter` yields. */
async function summarizeConfig(config: Config): Promise<string[]> {
  const results: string[] = [];
  for await (const item of configRepoIter(config)) {
    results.push(
      "error" in item ? `Err(${item.error})` : `Ok(${item.name}, ${item.path})`,
    );
  }
  results.sort();
  return results;
}

Deno.test("empty_config", async () => {
  assertEquals(await summarizeConfig(parseConfig('{"repos": []}')), []);
});

Deno.test("tree_no_repos", async () => {
  const home = await Home.init(await tempDir());
  await Deno.mkdir(join(home.path, "a/b/c1"), { recursive: true });
  await Deno.mkdir(join(home.path, "a/b/c2"), { recursive: true });
  await Deno.writeTextFile(join(home.path, "a/foo"), "n/a\n");

  assertEquals(
    await summarizeConfig({ repos: [{ root: home.path }] }),
    [],
  );
});

Deno.test("tree_is_repo_unnamed", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);

  const results = await summarizeConfig({ repos: [{ root: repo.path }] });
  assertEquals(results.length, 1);
  assertEquals(results[0].startsWith(`Ok(${repo.path}, `), true);
  assertEquals(results[0].endsWith(".git)"), true);
});

Deno.test("tree_is_repo_named", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);

  const results = await summarizeConfig({
    repos: [{ root: repo.path, replaceRoot: "BASE" }],
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].startsWith("Ok(BASE, "), true);
  assertEquals(results[0].endsWith(".git)"), true);
});

Deno.test("tree_contains_repos_named", async () => {
  const home = await Home.init(await tempDir());
  const repo1 = await home.gitInit("repos/one");
  await repo1.makeCommit(0);
  const repo2 = await home.gitInit("repos/two");
  await repo2.makeCommit(0);
  const repo3 = await home.gitInit("three");
  await repo3.makeCommit(0);

  const results = await summarizeConfig({
    repos: [{ root: home.path, replaceRoot: "BASE" }],
  });
  assertEquals(results.length, 3);
  const names = results.map((r) => r.slice(0, r.indexOf(", ") + 1));
  assertEquals(
    names.sort(),
    ["Ok(BASE/repos/one,", "Ok(BASE/repos/two,", "Ok(BASE/three,"].sort(),
  );
});

Deno.test("tree_contains_symlinked_repo_unnamed", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("real/repo");
  await repo.makeCommit(0);
  await Deno.mkdir(join(home.path, "base"), { recursive: true });
  await Deno.symlink(
    join(home.path, "real/repo"),
    join(home.path, "base/link"),
  );

  const results = await summarizeConfig({
    repos: [{ root: join(home.path, "base") }],
  });
  assertEquals(results.length, 1);
  assertEquals(
    results[0].startsWith(`Ok(${join(home.path, "base/link")}, `),
    true,
  );
});

Deno.test("tree_contains_symlinked_repo_named", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("real/repo");
  await repo.makeCommit(0);
  await Deno.mkdir(join(home.path, "base"), { recursive: true });
  await Deno.symlink(
    join(home.path, "real/repo"),
    join(home.path, "base/link"),
  );

  const results = await summarizeConfig({
    repos: [{ root: join(home.path, "base"), replaceRoot: "BASE" }],
  });
  assertEquals(results.length, 1);
  assertEquals(results[0].startsWith("Ok(BASE/link, "), true);
});
