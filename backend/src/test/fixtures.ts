// Test helpers for building real git repos on disk.

import { dirname, join } from "@std/path";

/** Run `git` in `cwd`, isolated from the real user/system git config. */
export async function runGit(
  home: string,
  cwd: string,
  args: string[],
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const command = new Deno.Command("git", {
    args,
    cwd,
    env: {
      HOME: home,
      GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  return {
    success,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

/**
 * The home directory for `git` operations in a test.
 *
 * `user.name`/`user.email` must be set for commits to work, and setting
 * `init.defaultBranch` avoids `git` warning about (and, worse, behaving
 * inconsistently around) the default branch name.
 */
export class Home {
  private constructor(public readonly path: string) {}

  static async init(path: string): Promise<Home> {
    const home = new Home(path);
    await Deno.mkdir(path, { recursive: true });
    await Deno.writeTextFile(
      join(path, ".gitconfig"),
      "[user]\n" +
        "name = Name\n" +
        "email = name@example.com\n" +
        "[init]\n" +
        "defaultBranch = main\n" +
        "[advice]\n" +
        "detachedHead = false\n" +
        "skippedCherryPicks = false\n",
    );
    return home;
  }

  /** Run `git` in `cwd` (relative to this home) and throw on failure. */
  async git(cwd: string, args: string[]): Promise<string> {
    const result = await runGit(this.path, cwd, args);
    if (!result.success) {
      throw new Error(
        `\`git ${
          args.join(" ")
        }\` in ${cwd} failed:\n${result.stdout}${result.stderr}`,
      );
    }
    return result.stdout;
  }

  async gitInit(relPath: string): Promise<Repo> {
    const repoPath = join(this.path, relPath);
    await this.git(this.path, ["init", "--quiet", repoPath]);
    return new Repo(this, repoPath);
  }

  async gitInitBare(relPath: string): Promise<Repo> {
    const repoPath = join(this.path, relPath);
    await this.git(this.path, ["init", "--quiet", "--bare", repoPath]);
    return new Repo(this, repoPath);
  }
}

/** A git repo (bare or not) rooted at `path`. */
export class Repo {
  constructor(
    public readonly home: Home,
    public readonly path: string,
  ) {}

  async git(args: string[]): Promise<string> {
    return await this.home.git(this.path, args);
  }

  async write(relPath: string, content: string): Promise<void> {
    const target = join(this.path, relPath);
    await Deno.mkdir(dirname(target), { recursive: true });
    await Deno.writeTextFile(target, content);
  }

  /** Make a commit with files `a` and `b`. */
  async makeCommit(n: number): Promise<void> {
    await this.write("a", `${n}a`);
    await this.write("b", `${n}b`);
    await this.git(["add", "a", "b"]);
    await this.git(["commit", "-m", `commit ${n}`]);
  }

  async clone(newRelPath: string): Promise<Repo> {
    const newPath = join(this.home.path, newRelPath);
    await this.home.git(this.home.path, ["clone", this.path, newPath]);
    return new Repo(this.home, newPath);
  }
}

/** Make a fresh temp directory for a test to use as its home/root. */
export async function tempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "repoyear-backend-test-" });
}
