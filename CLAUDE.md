# Contributions Tracker development guide

This is a web application that shows GitHub contributions in a calendar grid,
much like the one GitHub has. Each grid cell may have multiple colors indicating
which repositories were contributed to.

It has two parts:

1. A React/TypeScript app in the root directory. This is run with `deno`.
2. A Rust API server in `rust-crate/`.

## Working with `deno` instead of `npm`

Instead of using `npm install package`, use `deno add npm:package` (use `-D` to
add a development dependency just like with `npm`).

## Branching

When creating a branch, prefix it with "claude-".

## Committing

This project has pre-commit hooks that check formatting and linting.

For the frontend, you will want to run something like
`deno check && deno lint --fix && deno fmt` before committing.

For the backend, you will want to run something like `cargo clippy` to check
lints and `cargo fmt` to format the code before committing.

## Code comments

Inline comments should only be used when the code isn't clear, the reason for
the code isn't clear, or there is a non-obvious consideration that future
developers should know about.

## Collaboration style

Let me know when you think I'm making a mistake, or if there is something that I
don't seem to have realized.

Be concise and avoid hype.
