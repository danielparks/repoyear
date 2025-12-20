# Testing Guide

## Smoke Tests

The application includes a smoke test (`src/App.vitest.tsx`) that runs offline
using fixture data from GitHub. This verifies that the data processing pipeline
works correctly without requiring a live connection to GitHub's API.

### Running the smoke test

```bash
npm run vitest:run src/App.vitest.tsx
```

Or to run all tests:

```bash
npm run vitest:run
```

### Updating fixture data

When you modify the GitHub GraphQL query or want to test with fresh data:

```bash
GITHUB_READONLY_TOKEN=ghp_your_token_here npm run generate:fixture
```

Note: `GITHUB_READONLY_TOKEN` is used to avoid conflicts with the `gh` CLI tool.
The script will fall back to `GITHUB_TOKEN` if not set.

This will:

1. Fetch real contribution data from GitHub using your token
2. Save it to `src/__fixtures__/github-contributions.json`
3. The smoke test will automatically use this updated data

See `src/__fixtures__/README.md` for more details on generating fixtures.

### How it works

The smoke test:

- Mocks the GitHub API module to return fixture data instead of making real API
  calls
- Tests that the React Query integration works correctly
- Verifies that contribution data is processed into the Calendar model
- Ensures the UI renders without errors

This approach uses vitest's built-in mocking (`vi.mock()`) rather than
additional libraries like MSW.
