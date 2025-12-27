import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import type { Contributions } from "./github/api.ts";
import fixtureData from "./__fixtures__/github-contributions.json" with {
  type: "json",
};

vi.stubEnv("VITE_FRONTEND_URL", "/");
vi.stubEnv("VITE_GITHUB_CLIENT_ID", "CLIENT_ID");

vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("./github/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./github/api.ts")>();
  return {
    ...original,
    GitHub: class {
      octokit: { token: null | string } = { token: null };

      constructor(token: string) {
        this.octokit = { token };
      }

      installRateLimitReport() {
        // No-op for testing
      }

      async *queryBase(_username?: string) {
        if (!this.octokit.token) {
          throw new Error("Octokit token is null");
        } else if (!this.octokit.token.startsWith("good")) {
          throw new Error(
            `Octokit token does not start with "good": "${this.octokit.token}"`,
          );
        }
        yield* fixtureData as Contributions[];
      }
    },
  };
});

vi.mock("./api/client.ts", () => ({
  exchangeOAuthCode: vi.fn().mockResolvedValue("good-exchanged"),
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App username={null} />
    </QueryClientProvider>,
  );
}

describe("App smoke test", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should show a login prompt if there is no token", () => {
    renderApp();
    expect(screen.queryByText(/Log in with GitHub/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("should show an error if the token is invalid", async () => {
    localStorage.setItem("github_token", "error");
    renderApp();

    expect(screen.queryAllByText(/RepoYear/i)).not.toHaveLength(0);

    await waitFor(() => {
      expect(screen.queryByText(/Error getting contribution data/i))
        .toBeInTheDocument();
    }, { timeout: 500 });
  });

  it("should load and render contributions from fixture data", async () => {
    localStorage.setItem("github_token", "good");
    renderApp();

    expect(screen.queryByText(/Loading/i)).toBeInTheDocument();

    await waitFor(() => {
      const { name } = fixtureData[0] as Contributions;
      expect(
        screen.getByText(`RepoYear: ${name}`),
      ).toBeInTheDocument();

      expect(document.querySelector(".calendar-heat-map"))
        .toBeInTheDocument();
    }, { timeout: 500 });

    await waitFor(() => {
      expect(screen.queryByText(/Loading contributions/i)).not
        .toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
