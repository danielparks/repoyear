# Test Fixtures

This directory contains fixture data for testing.

## github-contributions.json

This file contains sample GitHub contributions data used by the smoke test in
`App.vitest.tsx`.

### Generating fixture data

To update the fixture with real data from GitHub:

```bash
# Using your own GitHub account (recommended)
GITHUB_READONLY_TOKEN=ghp_your_token_here npm run generate:fixture

# Or for a specific user
GITHUB_READONLY_TOKEN=ghp_your_token_here npm run generate:fixture username

# Or using deno directly
GITHUB_READONLY_TOKEN=ghp_your_token_here deno run -A scripts/generate-fixture.ts
```

Note: `GITHUB_READONLY_TOKEN` is used to avoid conflicts with the `gh` CLI tool.
The script will fall back to `GITHUB_TOKEN` if `GITHUB_READONLY_TOKEN` is not
set.

The fixture file is checked into the repository so tests can run offline without
requiring a GitHub token.

### Getting a GitHub token

1. Go to https://github.com/settings/tokens
2. Generate a new token (classic)
3. No scopes are required (read-only access to public data)
4. Copy the token and use it in the command above
