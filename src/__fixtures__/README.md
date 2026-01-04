# Test Fixtures

This directory contains fixture data for testing.

## github-contributions.json

This file contains sample GitHub contributions data used by the smoke test in
[`App.vitest.tsx`].

### Generating fixture data

To update the fixture with real data from GitHub:

```sh
# Using your own GitHub account (recommended)
GITHUB_READONLY_TOKEN=ghp_your_token_here deno run generate:fixture

# Or for a specific user
GITHUB_READONLY_TOKEN=ghp_your_token_here deno run generate:fixture username
```

You can use either `GITHUB_READONLY_TOKEN` or `GITHUB_TOKEN`; the `gh` tool uses
`GITHUB_TOKEN` so setting it to a read only tokens will interfere with `gh`.

The fixture file is checked into the repository so tests can run offline.

### Getting a GitHub token

1. Go to https://github.com/settings/tokens
2. Generate a new token (classic)
3. No scopes are required (read-only access to public data)
4. Copy the token and use it in the command above

Alternatively, you may use a fine-grained personal access token if you want to
grant access to private repositories. See the [RepoYear README.md] for
information about what permissions to grant.

[`App.vitest.tsx`]: ../App.vitest.tsx
[RepoYear README.md]: ../../README.md#github-token-access
