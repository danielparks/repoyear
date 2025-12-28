//! Scan repos for contribution data.

use git2::{ErrorCode, Oid, Repository};
use std::path::Path;

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
pub fn scan<P: AsRef<Path>>(repo: P) -> anyhow::Result<Vec<i64>> {
    let repo = Repository::open(repo)?;
    let mut revwalk = repo.revwalk()?;
    revwalk.set_sorting(git2::Sort::TIME)?;

    let default_branch_oid = get_default_branch(&repo)?;
    revwalk.push(default_branch_oid)?;

    for remote_name in repo.remotes()?.into_iter().flatten() {
        let remote = repo.find_remote(remote_name)?;
        if let Some(url) = remote.url()
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
    if let Some(branch) = remote_head_to_local_branch(repo, "origin")? {
        if let Some(oid) = ref_to_oid(repo, &branch)? {
            return Ok(oid);
        }
    }

    if let Some(branch) = remote_head_to_local_branch(repo, "upstream")? {
        if let Some(oid) = ref_to_oid(repo, &branch)? {
            return Ok(oid);
        }
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
            if let Some(target) = reference.symbolic_target() {
                if target.starts_with("refs/remotes/") {
                    let mut iter = target.splitn(4, '/');
                    if let Some(branch) = iter.nth(3) {
                        assert!(iter.next().is_none(), "bug in splitn");
                        return Ok(Some(branch.to_owned()));
                    }
                }
                // FIXME? log failure?
            }
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
    use crate::test as helper;
    use assert2::assert;
    use std::fs;
    use testdir::testdir;

    // FIXME add test of find default with remote
    // FIXME add test of find default with no config
    // FIXME add test of find default with no main or master
    // FIXME test having more/less commits than upstream

    #[test]
    fn scan_repo() {
        let root = testdir!();
        helper::prepare_root(&root);
        helper::git_init(&root, "repo");
        helper::make_commit(&root, "repo", 0);
        assert!(let Ok([_]) = scan(root.join("repo")).as_deref());
    }

    #[test]
    fn scan_repo_dotgit() {
        let root = testdir!();
        helper::prepare_root(&root);
        helper::git_init(&root, "repo");
        helper::make_commit(&root, "repo", 0);
        assert!(let Ok([_]) = scan(root.join("repo/.git")).as_deref());
    }

    #[test]
    fn scan_repo_subdir() {
        let root = testdir!();
        helper::prepare_root(&root);
        helper::git_init(&root, "repo");
        fs::create_dir(root.join("repo/dir")).unwrap();
        fs::write(root.join("repo/dir/a"), "a0").unwrap();
        helper::git(&root, "repo", ["add", "dir/a"]).unwrap();
        helper::git(&root, "repo", ["commit", "-m", "commit 0"]).unwrap();

        // FIXME check error code.
        assert!(let Err(_) = scan(root.join("repo/dir")).as_deref());
    }

    #[test]
    fn scan_nonrepo() {
        let root = testdir!();
        helper::prepare_root(&root);
        helper::git_init(&root, "repo");
        helper::make_commit(&root, "repo", 0);

        // FIXME check error code.
        assert!(let Err(_) = scan(root).as_deref());
    }

    #[test]
    fn scan_bare_repo() {
        let root = testdir!();
        helper::prepare_root(&root);
        helper::git_init_bare(&root, "bare_repo");
        helper::git(&root, ".", ["clone", "bare_repo", "repo"]).unwrap();

        helper::make_commit(&root, "repo", 0);
        helper::git(&root, "repo", ["push"]).unwrap();

        assert!(let Ok([_]) = scan(root.join("bare_repo")).as_deref());
    }
}
