// Scan repos for contribution data.

import { isAbsolute, join } from "@std/path";

/**
 * Resolve `path` to the git directory it names, matching `git2`'s
 * `Repository::open` semantics: it must be one of
 *
 *   - A working directory containing a `.git` directory (or gitlink file)
 *   - A `.git` directory itself
 *   - A bare repository
 *
 * Unlike `git -C <path>` (or `git rev-parse --show-toplevel`), this does
 * NOT discover a repository in a parent directory — a path that isn't
 * itself one of the above returns `null`.
 */
export async function resolveGitDir(path: string): Promise<string | null> {
  const dotGit = join(path, ".git");
  try {
    const stat = await Deno.lstat(dotGit);
    if (stat.isDirectory) {
      return (await isGitDirLayout(dotGit))
        ? await Deno.realPath(dotGit)
        : null;
    }
    if (stat.isFile) {
      // Worktree/submodule gitlink file: `gitdir: <path>`.
      const content = await Deno.readTextFile(dotGit);
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const target = match[1].trim();
      const resolved = isAbsolute(target) ? target : join(path, target);
      return (await isGitDirLayout(resolved))
        ? await Deno.realPath(resolved)
        : null;
    }
    return null;
  } catch {
    // No `.git` entry; fall through to check whether `path` itself is a
    // git directory (a bare repo, or a `.git` directory passed directly).
  }
  return (await isGitDirLayout(path)) ? await Deno.realPath(path) : null;
}

async function isGitDirLayout(dir: string): Promise<boolean> {
  try {
    const [head, objects, refs] = await Promise.all([
      Deno.stat(join(dir, "HEAD")),
      Deno.stat(join(dir, "objects")),
      Deno.stat(join(dir, "refs")),
    ]);
    return head.isFile && objects.isDirectory && refs.isDirectory;
  } catch {
    return false;
  }
}

interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

/** Run `git --git-dir=<gitDir> ...args`, pinned to an exact git directory. */
async function runGit(gitDir: string, args: string[]): Promise<GitResult> {
  const command = new Deno.Command("git", {
    args: ["--git-dir", gitDir, ...args],
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
 * Split `s` on `sep` into at most `n` pieces, with the final piece holding
 * any remainder (unlike `String.prototype.split`, which truncates it).
 */
function splitN(s: string, sep: string, n: number): string[] {
  const parts: string[] = [];
  let rest = s;
  for (let i = 0; i < n - 1; i++) {
    const idx = rest.indexOf(sep);
    if (idx === -1) break;
    parts.push(rest.slice(0, idx));
    rest = rest.slice(idx + sep.length);
  }
  parts.push(rest);
  return parts;
}

/** Resolve `name` (a ref, branch name, or `HEAD`) to a commit oid. */
async function refToOid(
  gitDir: string,
  name: string,
): Promise<string | null> {
  const result = await runGit(gitDir, [
    "rev-parse",
    "--verify",
    "--quiet",
    name,
  ]);
  if (!result.success) return null;
  const oid = result.stdout.trim();
  return oid.length > 0 ? oid : null;
}

/** Get the local branch name a remote `HEAD` points to, if any. */
async function remoteHeadToLocalBranch(
  gitDir: string,
  remote: string,
): Promise<string | null> {
  const result = await runGit(gitDir, [
    "symbolic-ref",
    `refs/remotes/${remote}/HEAD`,
  ]);
  if (!result.success) return null;

  const target = result.stdout.trim();
  if (!target.startsWith("refs/remotes/")) return null;

  const parts = splitN(target, "/", 4);
  return parts.length === 4 ? parts[3] : null;
}

/**
 * Find the default branch of a repository, as a commit oid.
 *
 * `git` doesn't really have a concept of a default branch, so this involves
 * some guesswork. We check:
 *
 *   1. `refs/remotes/origin/HEAD` to see if it points to a remote branch
 *   2. `refs/remotes/upstream/HEAD`
 *   3. Check if `$(git config init.defaultBranch)` is a branch
 *   4. Check if `main` is a branch
 *   5. Check if `master` is a branch
 *   6. Return `HEAD`
 *
 * @throws if none of the above resolve to a commit.
 */
export async function getDefaultBranch(gitDir: string): Promise<string> {
  for (const remote of ["origin", "upstream"]) {
    const branch = await remoteHeadToLocalBranch(gitDir, remote);
    if (branch !== null) {
      const oid = await refToOid(gitDir, branch);
      if (oid !== null) return oid;
    }
  }

  const configResult = await runGit(gitDir, [
    "config",
    "--get",
    "init.defaultBranch",
  ]);
  if (configResult.success) {
    const branch = configResult.stdout.trim();
    if (branch.length > 0) {
      const oid = await refToOid(gitDir, branch);
      if (oid !== null) return oid;
    }
  }

  for (const ref of ["refs/heads/main", "refs/heads/master", "HEAD"]) {
    const oid = await refToOid(gitDir, ref);
    if (oid !== null) return oid;
  }

  throw new Error("Could not find a default branch");
}

/** Scan history of a repository; commit dates as seconds since 1970. */
export async function scanRepo(gitDir: string): Promise<number[]> {
  const defaultOid = await getDefaultBranch(gitDir);

  const remotesResult = await runGit(gitDir, ["remote"]);
  const remoteNames = remotesResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const name of remoteNames) {
    const urlResult = await runGit(gitDir, ["remote", "get-url", name]);
    if (!urlResult.success) continue; // FIXME? warn about unreadable remote?
    const url = urlResult.stdout.trim();
    if (
      url.startsWith("git@github.com:") ||
      url.startsWith("https://github.com/")
    ) {
      // GitHub remote. Skip; any local commits are equivalent to branch
      // commits on GitHub.
      return [];
    }
  }

  const logResult = await runGit(gitDir, ["log", "--format=%at", defaultOid]);
  if (!logResult.success) {
    throw new Error(`git log failed: ${logResult.stderr}`);
  }
  return logResult.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => Number.parseInt(line, 10));
}

/** Scan history of a repository at `path`; commit dates as seconds since 1970. */
export async function scanRepoPath(path: string): Promise<number[]> {
  const gitDir = await resolveGitDir(path);
  if (gitDir === null) {
    throw new Error(`Not a git repository: ${path}`);
  }
  return scanRepo(gitDir);
}
