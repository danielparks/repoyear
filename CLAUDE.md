# RepoYear development guide

This is a web application that shows GitHub contributions as a calendar heat
map, much like the one GitHub has. It displays a 53 by 7 grid with each cell
representing a day. Cells may contain multiple color segments indicating which
repositories were contributed to.

It has two parts:

1. A React/TypeScript app in the root directory. This is run with `deno`.
2. A Rust API server in `backend/`.

## Codebase structure

### Entry points

The app has three modes, each with its own HTML file and TypeScript entry point:

1. **Dynamic mode** (`index.html` → `src/main.tsx`): Interactive mode that
   fetches data from GitHub via OAuth
2. **Static mode** (`static.html` → `src/static.tsx`): Displays pre-generated
   contribution data from `dist/assets/contributions.json`
3. **Compact mode** (`compact.html` → `src/compact.tsx`): Minimal static view
   without UI chrome

### Frontend structure (`src/`)

- **`model/`** - Core domain classes: `Calendar`, `Day`, `Repository`, `Filter`
- **`components/`** - React components
- **`hooks/`** - React hooks
- **`github/`** - GitHub GraphQL API client and types
- **`api/`** - Backend API client (generated from OpenAPI spec)
- **`__fixtures__`** - Test data

### Backend structure (`backend/`)

Rust API server that handles OAuth token exchange with GitHub.

### Key concepts

- **Calendar**: Represents a user's contribution history, organized by days and
  repositories
- **Filter**: Controls which repositories are visible in the graph
- Each day can have contributions to multiple repositories, visualized with
  multiple colors per grid cell

## Working with `deno` instead of `npm`

Instead of using `npm install package`, use `deno add npm:package` (use `-D` to
add a development dependency just like with `npm`).

As much configuration as possible should be put in `package.json` rather than
`deno.jsonc`.

## Branching

When creating a branch, prefix it with "claude-".

## Committing

This project has pre-commit hooks that check formatting and linting.

Before committing frontend changes, you will want to run something like:

    deno check --quiet && deno lint --fix && deno fmt

Before committing frontend changes, you will want to run something like:

    cargo clippy --quiet --all-features --all-targets --fix --allow-dirty
    cargo +nightly fmt

## Code comments

Inline comments should only be used when the code isn't clear, the reason for
the code isn't clear, or there is a non-obvious consideration that future
developers should know about.

## Collaboration style

Let me know when you think I'm making a mistake, or if there is something that I
don't seem to have realized.

Be concise and avoid hype.
