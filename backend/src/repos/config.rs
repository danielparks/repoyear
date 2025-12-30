//! Repository configuration parsing.

use super::Result;
use git2::{ErrorCode, Repository};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::slice;
use walkdir::{DirEntry, WalkDir};

/// Configuration.
#[derive(Debug, Clone, Deserialize, Eq, PartialEq)]
pub struct Config {
    /// Directory trees to search for repos.
    pub repos: Vec<TreeConfig>,
}

impl Config {
    /// Create a configuration with a single tree.
    pub fn with_tree<T: Into<TreeConfig>>(tree: T) -> Self {
        Self { repos: vec![tree.into()] }
    }

    /// Parse a TOML configuration.
    ///
    /// # Example
    ///
    /// ```
    /// use assert2::assert;
    /// use repoyear_backend::repos::{Config, TreeConfig};
    /// use std::path::PathBuf;
    ///
    /// assert!(
    ///     Config::parse(
    ///         r#"
    ///         [[repos]]
    ///         root = "/srv/git"
    ///         replace_root = "oxidized.org:git"
    ///
    ///         [[repos]]
    ///         root = "/home/daniel/special-repo"
    ///         "#
    ///     )
    ///     .unwrap()
    ///         == Config {
    ///             repos: vec![
    ///                 TreeConfig {
    ///                     root: PathBuf::from("/srv/git"),
    ///                     replace_root: Some("oxidized.org:git".to_owned()),
    ///                 },
    ///                 TreeConfig {
    ///                     root: PathBuf::from("/home/daniel/special-repo"),
    ///                     replace_root: None,
    ///                 },
    ///             ],
    ///         },
    /// );
    /// ```
    ///
    /// # Errors
    ///
    /// Returns an error if it can’t parse the configuration.
    pub fn parse(input: &str) -> Result<Self> {
        Ok(toml::from_str(input)?)
    }

    /// Find repos in the directory trees defined in this configuration.
    ///
    /// Returns an iterator that yields either pairs of repository names and
    /// open [`Repository`] objects, or errors. Specifically, it yields
    /// `Result<(String, Repository), RepoIterError>`.
    #[must_use]
    pub fn repo_iter(&self) -> ConfigRepoIter<'_> {
        let mut config_iter = self.repos.iter();
        let tree_iter = config_iter
            .next()
            .map(|tree_config| tree_config.repo_iter());
        ConfigRepoIter { config_iter, tree_iter }
    }
}

/// Convert `[(root, replace_root), ...]` to `Config`.
///
/// Convenience for writing tests.
impl<T> From<&[T]> for Config
where
    TreeConfig: for<'a> From<&'a T>,
{
    fn from(slice: &[T]) -> Self {
        Self { repos: slice.iter().map(TreeConfig::from).collect() }
    }
}

/// Convert an array, `[(root, replace_root)]`, to `Config`.
///
/// Convenience for writing tests.
impl<T, const N: usize> From<[T; N]> for Config
where
    TreeConfig: for<'a> From<&'a T>,
{
    fn from(arr: [T; N]) -> Self {
        Self { repos: arr.iter().map(TreeConfig::from).collect() }
    }
}

/// An iterator that yields `Result<(String, Repository), RepoIterError>`.
///
/// The `String` is the calculated repository name.
///
/// This yields results from one `Config`.
#[derive(Debug)]
pub struct ConfigRepoIter<'a> {
    /// The internal repos iterator.
    config_iter: slice::Iter<'a, TreeConfig>,

    /// The internal iterator over a configured search tree.
    tree_iter: Option<TreeRepoIter<'a>>,
}

impl Iterator for ConfigRepoIter<'_> {
    type Item = ::std::result::Result<(String, Repository), RepoIterError>;

    fn next(&mut self) -> Option<Self::Item> {
        while let Some(tree_iter) = &mut self.tree_iter {
            if let Some(item) = tree_iter.next() {
                return Some(item);
            }

            self.tree_iter = self
                .config_iter
                .next()
                .map(|tree_config| tree_config.repo_iter());
        }
        None
    }
}

/// Configuration for a repo search tree.
#[derive(Debug, Clone, Deserialize, Eq, PartialEq)]
pub struct TreeConfig {
    /// Path under which to look for repos.
    pub root: PathBuf,

    /// String to replace the `root` portion of the path with.
    ///
    /// # Example
    ///
    /// ```toml
    /// [[repos]]
    /// root = "/home/daniel/git"
    /// replace_root = "oxidized.org:"
    /// ```
    ///
    /// If there is a repo at `/home/daniel/git/repo`, it will be called
    /// `oxidized.org:/repo` in the output.
    pub replace_root: Option<String>,
}

impl TreeConfig {
    /// Find repositories in this directory tree.
    ///
    /// Returns an iterator that yields
    /// `Result<(String, Repository), RepoIterError>`.
    pub fn repo_iter(&self) -> TreeRepoIter<'_> {
        fn is_dir(entry: &DirEntry) -> bool {
            entry.file_type().is_dir()
        }
        TreeRepoIter {
            walker: WalkDir::new(&self.root)
                .follow_links(true)
                .into_iter()
                .filter_entry(is_dir),
            tree_config: self,
        }
    }
}

/// Convert `(root, replace_root)` to `TreeConfig`.
///
/// Convenience for writing tests.
impl From<(&str, Option<&str>)> for TreeConfig {
    fn from((root, replace_root): (&str, Option<&str>)) -> Self {
        Self {
            root: root.into(),
            replace_root: replace_root.map(ToString::to_string),
        }
    }
}

/// Convert `(root, replace_root)` to `TreeConfig`.
///
/// Convenience for writing tests.
impl From<(&Path, Option<&str>)> for TreeConfig {
    fn from((root, replace_root): (&Path, Option<&str>)) -> Self {
        Self {
            root: root.into(),
            replace_root: replace_root.map(ToString::to_string),
        }
    }
}

/// Convert `(root, replace_root)` to `TreeConfig`.
///
/// Convenience for writing tests.
impl From<(PathBuf, Option<&str>)> for TreeConfig {
    fn from((root, replace_root): (PathBuf, Option<&str>)) -> Self {
        Self { root, replace_root: replace_root.map(ToString::to_string) }
    }
}

/// Convert root path to `TreeConfig`.
///
/// Convenience for writing tests.
impl From<&Path> for TreeConfig {
    fn from(root: &Path) -> Self {
        Self { root: root.into(), replace_root: None }
    }
}

/// Convert root path to `TreeConfig`.
///
/// Convenience for writing tests.
impl From<PathBuf> for TreeConfig {
    fn from(root: PathBuf) -> Self {
        Self { root, replace_root: None }
    }
}

/// An iterator that yields `Result<(String, Repository), RepoIterError>`.
///
/// This yields results from one `TreeConfig`.
#[derive(Debug)]
pub struct TreeRepoIter<'a> {
    /// The internal [`walkdir`] iterator.
    walker: walkdir::FilterEntry<
        walkdir::IntoIter,
        for<'b> fn(&'b DirEntry) -> bool,
    >,

    /// The current name to re
    tree_config: &'a TreeConfig,
}

impl Iterator for TreeRepoIter<'_> {
    type Item = ::std::result::Result<(String, Repository), RepoIterError>;

    fn next(&mut self) -> Option<Self::Item> {
        fn get_name(
            root: &Path,
            replace_root: Option<&str>,
            path: &Path,
        ) -> String {
            #[expect(
                clippy::match_wild_err_arm,
                reason = "better panic message"
            )]
            match replace_root {
                Some(prefix) => match path.strip_prefix(root) {
                    Ok(suffix) => {
                        format!("{prefix}{}", suffix.display())
                    }
                    Err(_) => panic!(
                        "{path:?} found under {root:?}, but does not have it \
                        as a prefix",
                    ),
                },
                None => path.to_string_lossy().into_owned(),
            }
        }

        loop {
            match self.walker.next() {
                None => return None,
                Some(Err(error)) => return Some(Err(error.into())),
                Some(Ok(entry)) => match Repository::open(entry.path()) {
                    Ok(repository) => {
                        self.walker.skip_current_dir();
                        let name = get_name(
                            &self.tree_config.root,
                            self.tree_config.replace_root.as_deref(),
                            entry.path(),
                        );
                        return Some(Ok((name, repository)));
                    }
                    Err(error) if error.code() == ErrorCode::NotFound => {}
                    Err(error) => return Some(Err(error.into())),
                },
            }
        }
    }
}

/// Errors encountered by `ReposIter`.
#[derive(Debug, thiserror::Error)]
pub enum RepoIterError {
    /// An error encountered walking the directory tree.
    #[error(transparent)]
    Walkdir(#[from] walkdir::Error),

    /// An error encountered opening a Repository.
    #[error(transparent)]
    Git(#[from] git2::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test::{FsDirectory, Home};
    use assert2::assert;
    use testdir::testdir;

    type SummarizedRepo = Result<(String, PathBuf), String>;

    /// Get comparable representation of repo_iter item
    fn summarize_repo(
        result: Result<(String, Repository), RepoIterError>,
    ) -> SummarizedRepo {
        match result {
            Ok((name, repo)) => Ok((name, repo.path().to_owned())),
            Err(error) => Err(format!("{error:?}")),
        }
    }

    /// Get repos from a config and summarize
    #[expect(clippy::needless_pass_by_value, reason = "convenience")]
    fn summarize_config(config: Config) -> Vec<SummarizedRepo> {
        let mut vec: Vec<_> = config.repo_iter().map(summarize_repo).collect();
        vec.sort();
        vec
    }

    #[test]
    fn empty_config() {
        assert!(
            Config::parse("repos = []\n")
                .unwrap()
                .repo_iter()
                .collect::<Vec<_>>()
                .is_empty()
        );
    }

    #[test]
    fn tree_no_repos() {
        let home = Home::init(testdir!());
        home.mkdir("a/b/c1");
        home.mkdir("a/b/c2");
        home.write("a/foo", "n/a\n");

        assert!(summarize_config(Config::with_tree(home.path())) == []);
    }

    #[test]
    fn tree_is_repo_unnamed() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);

        assert!(
            summarize_config(Config::with_tree(repo.path()))
                == [Ok((
                    repo.path().to_string_lossy().into_owned(),
                    repo.join(".git")
                ))]
        );
    }

    #[test]
    fn tree_is_repo_named() {
        let home = Home::init(testdir!());
        let repo = home.git_init("repo");
        repo.make_commit(0);

        assert!(
            summarize_config(Config::with_tree((repo.path(), Some("BASE"))))
                == [Ok(("BASE".to_owned(), repo.join(".git")))]
        );
    }

    #[test]
    fn tree_contains_repos_named() {
        let home = Home::init(testdir!());
        let repo1 = home.git_init("repos/one");
        let repo2 = home.git_init("repos/two");
        let repo3 = home.git_init("three");

        assert!(
            summarize_config(Config::with_tree((home.path(), Some("BASE"))))
                == [
                    Ok(("BASErepos/one".to_owned(), repo1.join(".git"))),
                    Ok(("BASErepos/two".to_owned(), repo2.join(".git"))),
                    Ok(("BASEthree".to_owned(), repo3.join(".git")))
                ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn tree_contains_symlinked_repo_unnamed() {
        let home = Home::init(testdir!());
        let repo = home.git_init("real/repo");
        home.symlink("real/repo", "base/link");

        assert!(
            summarize_config(Config::with_tree(home.join("base")))
                == [Ok((
                    home.join("base/link").to_string_lossy().into_owned(),
                    repo.join(".git")
                ))]
        );
    }

    #[cfg(unix)]
    #[test]
    fn tree_contains_symlinked_repo_named() {
        let home = Home::init(testdir!());
        let repo = home.git_init("real/repo");
        home.symlink("real/repo", "base/link");

        assert!(
            summarize_config(Config::with_tree((
                home.join("base"),
                Some("BASE")
            ))) == [Ok(("BASElink".to_owned(), repo.join(".git")))]
        );
    }
}
