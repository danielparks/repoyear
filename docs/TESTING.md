# Testing Guide

## Unit Tests

```sh
deno test
```

Deno-based unit tests are found in `*.test.ts` files, e.g.
[`src/model.test.ts`].

## Vitest

```sh
deno run vitest:run
```

Vitest tests are found in `*.vitest.tsx` files, e.g.
[`src/components/RepositoryList.vitest.tsx`].

## Smoke Test

```sh
deno run vitest:run src/App.vitest.tsx
```

[`src/App.vitest.tsx`] runs offline using [Vitest’s built-in mocking] with
[fixture data] from GitHub. Its primary purpose is to verify that query data is
processed and displayed without errors.

### Updating fixture data

When you modify the GitHub GraphQL query or want to test with fresh data:

```sh
GITHUB_READONLY_TOKEN=ghp_your_token_here deno run generate:fixture
```

See [`src/__fixtures__/README.md`][fixture data] for more information.

[`src/model.test.ts`]: ../src/model.test.ts
[`src/components/RepositoryList.vitest.tsx`]: ../src/components/RepositoryList.vitest.tsx
[`src/App.vitest.tsx`]: ../src/App.vitest.tsx
[Vitest’s built-in mocking]: https://vitest.dev/guide/mocking
[fixture data]: ../src/__fixtures__/README.md
