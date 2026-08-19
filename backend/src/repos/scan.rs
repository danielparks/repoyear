//! Scan repos for contribution data.

use git2::{ErrorCode, Oid, Repository};
use std::path::Path;

// FIXME use super::Error and super::Result

/// Scan history of a repository and commit dates as seconds since 1970.
///
/// The path must be one of:
///
///   * A repository working directory containing a `.git` directory
///   * A `.git` directory itself
///   * A bare repository
///
/// # Errors
///
/// Returns an error if there was a problem with the repository. Returns
/// `Ok(None)` if the remote HEAD could not be found.
pub fn scan_repo_path<P: AsRef<Path>>(path: P) -> anyhow::Result<Vec<i64>> {
    scan_repo(&Repository::open(path)?)
}

/// Scan history of a repository and commit dates as seconds since 1970.
///
/// # Errors
///
/// Returns an error if there was a problem with the repository. Returns
/// `Ok(None)` if the remote HEAD could not be found.
pub fn scan_repo(repo: &Repository) -> anyhow::Result<Vec<i64>> {
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let default_branch_oid = get_default_branch(repo)?;
    revwalk.push(default_branch_oid)?;

    for remote_name in repo.remotes()?.into_iter().flatten().flatten() {
        let remote = repo.find_remote(remote_name)?;
        if let Ok(url) = remote.url()
            && (url.starts_with("git@github.com:")
                || url.starts_with("https://github.com/"))
        {
            // GitHub remote. Skip; any local commits are equivalent to branch
            // commits on GitHub.
            return Ok(Vec::new());
        }
        // FIXME warn about non UTF-8?
    }

    revwalk
        .map(|oid| {
            oid.and_then(|oid| repo.find_commit(oid))
                .map(|commit| commit.author().when().seconds())
                .map_err(anyhow::Error::from)
        })
        .collect()
}

/// Find the default branch of a repository.
///
/// `git` doesn’t really have a concept of a default branch, so this involves
/// some guess work. We check:
///
///   1. `refs/remotes/origin/HEAD` to see if it points to a remote branch
///   2. `refs/remotes/upstream/HEAD`?
///   3. Check if `$(git config init.defaultBranch)` is a branch
///   4. Check if `main` is a branch.
///   5. Check if `master` is a branch.
///   6. Return `HEAD`
///
/// # Errors
///
/// Returns an error if there was a problem with the repository. Returns
/// `Ok(None)` if the remote HEAD could not be found.
pub fn get_default_branch(repo: &Repository) -> anyhow::Result<Oid> {
    if let Some(branch) = remote_head_to_local_branch(repo, "origin")?
        && let Some(oid) = ref_to_oid(repo, &branch)?
    {
        return Ok(oid);
    }

    if let Some(branch) = remote_head_to_local_branch(repo, "upstream")?
        && let Some(oid) = ref_to_oid(repo, &branch)?
    {
        return Ok(oid);
    }

    match repo.config()?.get_string("init.defaultBranch") {
        Ok(branch) => {
            if let Some(oid) = ref_to_oid(repo, &branch)? {
                return Ok(oid);
            }
        }
        Err(error) if error.code() == ErrorCode::NotFound => {}
        Err(error) => return Err(error.into()),
    }

    if let Some(oid) = ref_to_oid(repo, "refs/heads/main")? {
        Ok(oid)
    } else if let Some(oid) = ref_to_oid(repo, "refs/heads/master")? {
        Ok(oid)
    } else if let Some(oid) = ref_to_oid(repo, "HEAD")? {
        Ok(oid)
    } else {
        Err(anyhow::anyhow!("Could not find a default branch"))
    }
}

/// Get the branch name a remote HEAD points to.
///
/// # Errors
///
/// Returns an error if there was a problem with the repository. Returns
/// `Ok(None)` if the remote HEAD could not be found.
fn remote_head_to_local_branch(
    repo: &Repository,
    origin: &str,
) -> anyhow::Result<Option<String>> {
    match repo.find_reference(&format!("refs/remotes/{origin}/HEAD")) {
        Ok(reference) => {
            if let Ok(Some(target)) = reference.symbolic_target()
                && target.starts_with("refs/remotes/")
            {
                let mut iter = target.splitn(4, '/');
                if let Some(branch) = iter.nth(3) {
                    assert!(iter.next().is_none(), "bug in splitn");
                    return Ok(Some(branch.to_owned()));
                }
            }
            // FIXME? log failure?
            // else: try next thing, though it’s weird this isn’t symbolic.
            // FIXME log?
            Ok(None)
        }
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Find the `Oid` for a ref.
///
/// # Errors
///
/// Returns an error if there was a problem parsing `name` or with the
/// repository. Returns `Ok(None)` if the ref could not be found.
fn ref_to_oid(repo: &Repository, name: &str) -> anyhow::Result<Option<Oid>> {
    match repo.revparse_single(name) {
        Ok(object) => Ok(Some(object.id())),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test::{FsDirectory, Home};
    use assert2::assert;
    use testdir::testdir;

    #[test]
    fn default_branch_prefers_origin_head_over_upstream_head() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0); // main: 1 commit (c0)

        repo.git(["branch", "upstream-branch"]);
        repo.git(["checkout", "upstream-branch"]);
        repo.make_commit(1); // upstream-branch: 2 commits (c0, c1)

        repo.git(["branch", "origin-branch"]); // branched from upstream-branch
        repo.git(["checkout", "origin-branch"]);
        repo.make_commit(2); // origin-branch: 3 commits (c0, c1, c2)

        repo.git(["checkout", "main"]);

        repo.git([
            "symbolic-ref",
            "refs/remotes/upstream/HEAD",
            "refs/remotes/upstream/upstream-branch",
        ]);
        repo.git([
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/origin-branch",
        ]);

        // Both origin/HEAD and upstream/HEAD are set, pointing at different
        // (real) branches with different history lengths: origin must win.
        assert!(let Ok([_, _, _]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn default_branch_falls_back_to_upstream_head_over_config() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0); // main: 1 commit (c0)

        repo.git(["branch", "config-branch"]);
        repo.git(["checkout", "config-branch"]);
        repo.make_commit(1); // config-branch: 2 commits (c0, c1)

        repo.git(["branch", "upstream-branch"]); // branched from config-branch
        repo.git(["checkout", "upstream-branch"]);
        repo.make_commit(2); // upstream-branch: 3 commits (c0, c1, c2)

        repo.git(["checkout", "main"]);

        repo.git(["config", "init.defaultBranch", "config-branch"]);
        repo.git([
            "symbolic-ref",
            "refs/remotes/upstream/HEAD",
            "refs/remotes/upstream/upstream-branch",
        ]);

        // No origin/HEAD; upstream/HEAD and init.defaultBranch both point at
        // real, different branches: upstream must win over the config.
        assert!(let Ok([_, _, _]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn default_branch_uses_local_config_when_no_remote_head() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0); // main: 1 commit

        repo.git(["branch", "feature"]);
        repo.git(["checkout", "feature"]);
        repo.make_commit(1); // feature: 2 commits
        repo.git(["checkout", "main"]);

        repo.git(["config", "init.defaultBranch", "feature"]);

        assert!(let Ok([_, _]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn default_branch_local_config_falls_through_when_branch_missing() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0); // main: 1 commit

        // "ghost" doesn't exist, so this should fall through to `main`
        // rather than erroring.
        repo.git(["config", "init.defaultBranch", "ghost"]);

        assert!(let Ok([_]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn default_branch_uses_master_when_no_main() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        repo.git(["branch", "-m", "main", "master"]);

        // The home's global `init.defaultBranch = main` config still points
        // at a branch that no longer exists, so this exercises the
        // `master` fallback specifically.
        assert!(let Ok([_]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn default_branch_falls_back_to_head() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        // No `main`, no `master`, and the global `init.defaultBranch = main`
        // config points at a branch that doesn't exist either.
        repo.git(["branch", "-m", "main", "custom"]);

        assert!(let Ok([_]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn scan_empty_repo_errors() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        // No commits: HEAD is unborn, and there's no branch to fall back to.
        assert!(let Err(_) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn scan_repo_uses_author_time_not_committer_time() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.write("a", "a");
        repo.git(["add", "a"]);
        repo.git([
            "commit",
            "-m",
            "commit",
            "--date",
            "2000-01-01T00:00:00+00:00",
        ]);

        // If this used committer time instead of author time, it would be
        // ~now, not the fixed date above (946_684_800 = 2000-01-01 UTC).
        assert!(scan_repo_path(repo.path()).unwrap() == vec![946_684_800]);
    }

    #[test]
    fn scan_repo_skips_when_origin_is_github_ssh() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        repo.git([
            "remote",
            "add",
            "origin",
            "git@github.com:example/repo.git",
        ]);

        assert!(scan_repo_path(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn scan_repo_skips_when_origin_is_github_https() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        repo.git([
            "remote",
            "add",
            "origin",
            "https://github.com/example/repo.git",
        ]);

        assert!(scan_repo_path(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn scan_repo_returns_history_for_non_github_remote() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        repo.git([
            "remote",
            "add",
            "origin",
            "https://git.example.com/repo.git",
        ]);

        assert!(let Ok([_]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn scan_repo_skips_if_any_remote_is_github() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        repo.git([
            "remote",
            "add",
            "origin",
            "https://git.example.com/repo.git",
        ]);
        repo.git([
            "remote",
            "add",
            "github",
            "https://github.com/example/repo.git",
        ]);

        // Documents current behavior: a single GitHub remote is enough to
        // skip the whole repo, even if other remotes aren't GitHub. Worth
        // confirming this is actually intended.
        assert!(scan_repo_path(repo.path()).unwrap().is_empty());
    }

    #[test]
    fn scan_repo() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        assert!(let Ok([_]) = scan_repo_path(repo.path()).as_deref());
    }

    #[test]
    fn scan_repo_dotgit() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);
        assert!(let Ok([_]) = scan_repo_path(repo.path().join(".git")).as_deref());
    }

    #[test]
    fn scan_repo_subdir() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");

        repo.write("dir/a", "a0");
        repo.git(["add", "dir/a"]);
        repo.git(["commit", "-m", "commit 0"]);

        // FIXME check error code.
        assert!(let Err(_) = scan_repo_path(repo.join("dir")).as_deref());
    }

    #[test]
    fn scan_nonrepo() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);

        // FIXME check error code.
        assert!(let Err(_) = scan_repo_path(home.path()).as_deref());
    }

    #[test]
    fn scan_bare_repo() {
        let home = Home::init(testdir!());
        let bare_repo = home.git_init_bare("bare_repo");
        let repo = bare_repo.clone("repo");
        repo.make_commit(0);
        repo.git(["push"]);

        assert!(let Ok([_]) = scan_repo_path(bare_repo.path()).as_deref());
    }
}
