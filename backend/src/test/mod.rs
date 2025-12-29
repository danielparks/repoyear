//! Test helpers for both unit and integration tests

use bstr::ByteSlice;
use duct::cmd;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

/// Convenience functions for working with directory-like things.
pub trait FsDirectory {
    /// Get the path to this directory.
    #[must_use]
    fn path(&self) -> &Path;

    /// Join a path to this.
    ///
    /// Equivalent to `dir.path().join(...)`.
    #[must_use]
    #[inline]
    fn join<P: AsRef<Path>>(&self, path: P) -> PathBuf {
        self.path().join(path)
    }

    /// Make a subdirectory.
    ///
    /// Creates all parent directories if necessary.
    fn mkdir<P: AsRef<Path>>(&self, path: P) {
        fs::create_dir_all(self.join(path)).unwrap();
    }

    /// Write a file.
    ///
    /// Creates all parent directories if necessary.
    fn write<P: AsRef<Path>>(&self, path: P, content: &str) {
        let path = self.join(path);
        self.mkdir(path.parent().unwrap());
        fs::write(path, content).unwrap();
    }
}

/// The home directory for `git` operations.
#[derive(Debug)]
pub struct Home(PathBuf);

impl FsDirectory for Home {
    /// Get the path to the home directory.
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Home {
    /// Create a `Home` for an existing directory.
    pub fn existing<P: Into<PathBuf>>(path: P) -> Self {
        Self(path.into())
    }

    /// # Create a new home directory.
    ///
    /// ## `.gitconfig`
    ///
    /// `user.name` and `user.email` must be set for commits to work in GitHub
    /// actions. Having them set also helps to avoid confusing warnings, as do
    /// the settings in `advice`.
    ///
    /// If `init.defaultBranch` is not set, `git` gives a warning about the
    /// default branch being subject to change, and if you explicitly set the
    /// initial branch on `git init` to something other than the default branch,
    /// it will register the repo as non-empty even if there are no commits.
    /// (I’m not sure if this is a bug or not.)
    ///
    /// # Panics
    ///
    ///   * It can’t create the directory at `path` and the directory doesn’t
    ///     already exist.
    ///   * It can’t write `{path}/.gitconfig`.
    pub fn init<P: Into<PathBuf>>(path: P) -> Self {
        let home = Self::existing(path);
        home.write(
            ".gitconfig",
            "[user]\n\
            name = Name\n\
            email = name@example.com\n\
            [init]\n\
            defaultBranch = main\n\
            [advice]\n\
            detachedHead = false\n\
            skippedCherryPicks = false\n",
        );
        home
    }

    /// Run `git` in the `cwd` directory and report errors.
    ///
    /// Prints `git` command line and working directory to stdout. If the
    /// command is successful, it prints its output, too.
    ///
    /// # Errors
    ///
    /// Returns `std::io::Error` if the process fails, or if there was an actual
    /// IO error (internally this uses [`duct::Expression::run()`]).
    pub fn try_git<P, I, S>(&self, cwd: P, args: I) -> std::io::Result<()>
    where
        P: AsRef<Path>,
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        let args: Vec<OsString> = args.into_iter().map(Into::into).collect();
        let shell_args =
            shell_words::join(args.iter().map(|arg| arg.to_string_lossy()));

        println!("`git {shell_args}` in {:?}", self.join(&cwd));
        let output = run_git(&self.0, cwd, args).run()?;
        print!("{}", output.stdout.as_bstr());
        Ok(())
    }

    /// Run `git` in the `cwd` directory and panic on errors.
    ///
    /// Prints `git` command line and working directory to stdout. If the
    /// command is successful, it prints its output, too.
    ///
    /// # Panics
    ///
    /// Panics if the process fails, or if there was an actual IO error.
    pub fn git<P, I, S>(&self, cwd: P, args: I)
    where
        P: AsRef<Path>,
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        self.try_git(cwd, args).unwrap();
    }

    /// Create a git repository.
    ///
    /// # Panics
    ///
    /// Panics if there was a problem creating the repository.
    pub fn git_init<P: AsRef<Path>>(&self, path: P) -> Repo<'_> {
        let path = self.join(path);
        self.git(&self.0, [o("init"), o(&path)]);
        Repo { home: self, repo: path }
    }

    /// Create a bare git repository.
    ///
    /// # Panics
    ///
    /// Panics if there was a problem creating the repository.
    pub fn git_init_bare<P: AsRef<Path>>(&self, path: P) -> BareRepo<'_> {
        let path = self.join(path);
        self.git(&self.0, [o("init"), o("--bare"), o(&path)]);
        BareRepo { home: self, repo: path }
    }
}

/// A git repo.
#[derive(Debug)]
pub struct Repo<'a> {
    home: &'a Home,
    repo: PathBuf,
}

impl FsDirectory for Repo<'_> {
    /// Get the path to this repo.
    fn path(&self) -> &Path {
        &self.repo
    }
}

impl Repo<'_> {
    /// Get the `Home` for this repo.
    #[must_use]
    pub fn home(&self) -> &Home {
        self.home
    }

    /// Run `git` in the repo directory and panic on errors.
    ///
    /// Prints `git` command line and working directory to stdout. If the
    /// command is successful, it prints its output, too.
    ///
    /// # Panics
    ///
    /// Panics if the process fails, or if there was an actual IO error.
    pub fn git<I, S>(&self, args: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        self.home.git(&self.repo, args);
    }

    /// Make a commit with files a and b.
    ///
    /// # Panics
    ///
    /// Panics if there was a problem creating the commit.
    pub fn make_commit(&self, n: u8) {
        self.write("a", &format!("{n}a"));
        self.write("b", &format!("{n}b"));
        self.git(["add", "a", "b"]);
        self.git(["commit", "-m", &format!("commit {n}")]);
    }
}

/// A bare git repo.
#[derive(Debug)]
pub struct BareRepo<'a> {
    home: &'a Home,
    repo: PathBuf,
}

impl FsDirectory for BareRepo<'_> {
    /// Get the path to this repo.
    fn path(&self) -> &Path {
        &self.repo
    }
}

impl BareRepo<'_> {
    /// Get the `Home` for this repo.
    #[must_use]
    pub fn home(&self) -> &Home {
        self.home
    }

    /// Clone this bare repo into a `Repo`.
    pub fn clone<P: AsRef<Path>>(&self, new_repo: P) -> Repo<'_> {
        let new_repo = self.home.path().join(new_repo);
        self.home
            .git(self.home.path(), [o("clone"), o(&self.repo), o(&new_repo)]);
        Repo { home: self.home, repo: new_repo }
    }
}

/// Convert something to an [`OsString`].
pub fn o<S: Into<OsString>>(input: S) -> OsString {
    input.into()
}

/// Set up a call to `git` in the `cwd` directory.
///
/// If `cwd` is relative, it will be interpreted in the context of `home`.
/// `home` should contain a `.gitconfig` file.
pub fn run_git<PH, PC, I, S>(home: PH, cwd: PC, args: I) -> duct::Expression
where
    PH: AsRef<Path>,
    PC: AsRef<Path>,
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let home: &Path = home.as_ref();
    cmd("git", args)
        .dir(home.join(cwd))
        .env("HOME", home)
        .env("GIT_CONFIG_GLOBAL", home.join(".gitconfig"))
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .stderr_to_stdout()
        .stdout_capture()
}
