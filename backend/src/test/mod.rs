//! Test helpers for both unit and integration tests

use bstr::ByteSlice;
use duct::cmd;
use std::ffi::OsString;
use std::fs;
use std::path::Path;

/// Set up a call to `git` in the `repo` directory.
fn run_git<I, S>(root: &Path, repo: &str, args: I) -> duct::Expression
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    cmd("git", args)
        .dir(root.join(repo))
        .env("HOME", root)
        .env("GIT_CONFIG_GLOBAL", root.join(".gitconfig"))
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .stderr_to_stdout()
        .stdout_capture()
}

/// Run `git` in the `repo` directory and report errors.
///
/// Prints `git` command line and working directory to stdout. If the command is
/// successful, it prints its output, too.
///
/// # Errors
///
/// Returns `std::io::Error` if the process fails, or if there was an actual IO
/// error (internally this uses [`duct::Expression::run()`]).
pub fn git<I, S>(root: &Path, repo: &str, args: I) -> std::io::Result<()>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    let args: Vec<OsString> = args.into_iter().map(Into::into).collect();
    let shell_args =
        shell_words::join(args.iter().map(|arg| arg.to_string_lossy()));

    println!("`git {shell_args}` in {}", root.join(repo).display());
    let output = run_git(root, repo, args).run()?;
    print!("{}", output.stdout.as_bstr());
    Ok(())
}

/// Prepare root directory of a test.
///
/// `user.name` and `user.email` must be set for commits to work in GitHub
/// actions. Having them set also helps to avoid confusing warnings, as do the
/// settings in `advice`.
///
/// If `init.defaultBranch` is not set, `git` gives a warning about the default
/// branch being subject to change, and if you explicitly set the initial branch
/// on `git init` to something other than the default branch, it will register
/// the repo as non-empty even if there are no commits. (I’m not sure if this is
/// a bug or not.)
///
/// # Panics
///
/// Panics if there was a problem writing `{root}/.gitConfig`.
pub fn prepare_root(root: &Path) {
    fs::write(
        root.join(".gitconfig"),
        "[user]\n\
        name = Name\n\
        email = name@example.com\n\
        [init]\n\
        defaultBranch = main\n\
        [advice]\n\
        detachedHead = false\n\
        skippedCherryPicks = false\n",
    )
    .unwrap();
}

/// Create a git repository.
///
/// # Panics
///
/// Panics if there was a problem creating the repository.
pub fn git_init(root: &Path, name: &str) {
    git(root, ".", ["init", name]).unwrap();
}

/// Create a bare git repository.
///
/// # Panics
///
/// Panics if there was a problem creating the repository.
pub fn git_init_bare(root: &Path, name: &str) {
    git(root, ".", ["init", "--bare", name]).unwrap();
}

/// Make a commit with files a and b.
///
/// # Panics
///
/// Panics if there was a problem creating the commit.
pub fn make_commit(root: &Path, repo: &str, n: u8) {
    fs::write(root.join(repo).join("a"), format!("{n}a")).unwrap();
    fs::write(root.join(repo).join("b"), format!("{n}b")).unwrap();
    git(root, repo, ["add", "a", "b"]).unwrap();
    git(root, repo, ["commit", "-m", &format!("commit {n}")]).unwrap();
}
