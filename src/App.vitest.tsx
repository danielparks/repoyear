import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import type { Contributions } from "./github/api.ts";
import fixtureData from "./__fixtures__/github-contributions.json";

// Mock the github/api module
vi.mock("./github/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./github/api.ts")>();
  return {
    ...original,
    GitHub: class {
      octokit = {};

      installRateLimitReport() {
        // No-op for testing
      }

      async *queryBase(_username?: string): AsyncGenerator<Contributions> {
        // Yield fixture data
        for (const contribution of fixtureData as Contributions[]) {
          yield contribution;
        }
      }
    },
  };
});

// Mock the OAuth exchange to avoid network calls
vi.mock("./api/client.ts", () => ({
  exchangeOAuthCode: vi.fn().mockResolvedValue("fake-token"),
}));

describe("App smoke test", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    localStorage.clear();
  });

  it("should load and render contributions from fixture data", async () => {
    localStorage.setItem("github_token", "test-token");

    render(
      <QueryClientProvider client={queryClient}>
        <App username={null} />
      </QueryClientProvider>,
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading contributions/i)).not
          .toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const firstContribution = fixtureData[0] as Contributions;
    expect(
      screen.getByText(`Contribution Graph for ${firstContribution.name}`),
    ).toBeInTheDocument();
  });

  it("should process contribution data into calendar model", async () => {
    localStorage.setItem("github_token", "test-token");

    render(
      <QueryClientProvider client={queryClient}>
        <App username={null} />
      </QueryClientProvider>,
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading contributions/i)).not
          .toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    const contributionsTable = document.querySelector("table.contributions");
    expect(contributionsTable).toBeInTheDocument();
  });

  it("should handle multiple contribution updates", async () => {
    localStorage.setItem("github_token", "test-token");

    render(
      <QueryClientProvider client={queryClient}>
        <App username={null} />
      </QueryClientProvider>,
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading contributions/i)).not
          .toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
