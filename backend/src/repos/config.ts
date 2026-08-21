// Repository configuration parsing and repo discovery.

import { join } from "@std/path";
import { parse as parseJsonc } from "@std/jsonc";
import { resolveGitDir } from "./scan.ts";

/** Configuration for a repo search tree. */
export interface TreeConfig {
  /** Path under which to look for repos. */
  root: string;

  /**
   * String to replace the `root` portion of a found repo's path with.
   *
   * If there is a repo at `/home/daniel/git/repo` and `root` is
   * `/home/daniel/git` with `replaceRoot` set to `"oxidized.org:"`, it will
   * be called `oxidized.org:/repo` in the output.
   */
  replaceRoot?: string;
}

/** Configuration. */
export interface Config {
  /** Directory trees to search for repos. */
  repos: TreeConfig[];
}

/**
 * Parse a JSONC configuration.
 *
 * @throws if `input` isn't valid JSONC, or doesn't match the expected shape.
 */
export function parseConfig(input: string): Config {
  const data = parseJsonc(input);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Config must be a JSON object with a `repos` array");
  }

  const repos = (data as Record<string, unknown>).repos;
  if (!Array.isArray(repos)) {
    throw new Error("Config.repos must be an array");
  }

  return {
    repos: repos.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`Config.repos[${index}] must be an object`);
      }
      const { root, replaceRoot } = entry as Record<string, unknown>;
      if (typeof root !== "string") {
        throw new Error(`Config.repos[${index}].root must be a string`);
      }
      if (replaceRoot !== undefined && typeof replaceRoot !== "string") {
        throw new Error(
          `Config.repos[${index}].replaceRoot must be a string`,
        );
      }
      return { root, replaceRoot };
    }),
  };
}

/** A repository found while searching a directory tree. */
export interface FoundRepo {
  /** The calculated repository name. */
  name: string;
  /** The resolved git directory. */
  path: string;
}

/** An error encountered while searching a directory tree. */
export interface RepoIterError {
  error: Error;
}

/**
 * Find repos in the directory trees defined in `config`.
 *
 * Yields either a found repo, or an error encountered along the way (a
 * single unreadable directory doesn't abort the whole search).
 */
export async function* configRepoIter(
  config: Config,
): AsyncGenerator<FoundRepo | RepoIterError> {
  for (const tree of config.repos) {
    yield* treeRepoIter(tree);
  }
}

/** Find repositories in one directory tree. */
export async function* treeRepoIter(
  tree: TreeConfig,
): AsyncGenerator<FoundRepo | RepoIterError> {
  yield* walk(tree.root, tree, new Set());
}

async function* walk(
  dir: string,
  tree: TreeConfig,
  visited: Set<string>,
): AsyncGenerator<FoundRepo | RepoIterError> {
  let real: string;
  try {
    real = await Deno.realPath(dir);
  } catch (error) {
    yield { error: asError(error) };
    return;
  }
  // Guard against symlink cycles.
  if (visited.has(real)) return;
  visited.add(real);

  let gitDir: string | null;
  try {
    gitDir = await resolveGitDir(dir);
  } catch (error) {
    yield { error: asError(error) };
    return;
  }

  if (gitDir !== null) {
    yield { name: getName(tree.root, tree.replaceRoot, dir), path: gitDir };
    return; // Don't descend into a found repo.
  }

  let entries: Deno.DirEntry[];
  try {
    entries = await Array.fromAsync(Deno.readDir(dir));
  } catch (error) {
    yield { error: asError(error) };
    return;
  }

  for (const entry of entries) {
    const childPath = join(dir, entry.name);
    let isDir = entry.isDirectory;
    if (entry.isSymlink) {
      try {
        isDir = (await Deno.stat(childPath)).isDirectory;
      } catch {
        isDir = false; // Broken symlink; skip.
      }
    }
    if (isDir) {
      yield* walk(childPath, tree, visited);
    }
  }
}

/** Get the calculated name for a found repo. */
function getName(
  root: string,
  replaceRoot: string | undefined,
  path: string,
): string {
  if (replaceRoot === undefined) {
    return path;
  }
  if (!path.startsWith(root)) {
    throw new Error(
      `${path} found under ${root}, but does not have it as a prefix`,
    );
  }
  return `${replaceRoot}${path.slice(root.length)}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
