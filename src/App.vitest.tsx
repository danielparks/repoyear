import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import type { Contributions } from "./github/api.ts";
import fixtureData from "./__fixtures__/github.json" with {
  type: "json",
};

class MockHttpError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "HttpError";
  }
}

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
          throw new MockHttpError(`Bad access token: "${this.octokit.token}"`);
        }
        yield* fixtureData as Contributions[];
      }
    },
  };
});

function mockTokenData(
  accessToken = "good-exchanged",
  refreshToken = "good-refresh",
) {
  return {
    accessToken,
    refreshToken,
    expiresIn: 28800,
    refreshTokenExpiresIn: 15897600,
  };
}

vi.mock("./api/client.ts", () => ({
  // deno-lint-ignore require-await
  getContributions: async () => ({}),
  exchangeOAuthCode: (code: string) => {
    if (code.startsWith("good")) {
      return mockTokenData(code);
    } else {
      throw new Error(`exchangeOAuthCode bad code ${code}`);
    }
  },
  refreshOAuthToken: (refreshToken: string) => {
    if (refreshToken.startsWith("good")) {
      return mockTokenData(refreshToken);
    } else {
      throw new Error(`refreshOAuthToken bad refreshToken ${refreshToken}`);
    }
  },
}));

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App
        frontendUrl="/"
        githubClientId="CLIENT_ID"
      />
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

  it("should show an error if it cannot refresh the token", async () => {
    localStorage.setItem(
      "repoyear_github_token_data",
      JSON.stringify(mockTokenData("expired-original", "expired-refresh")),
    );
    renderApp();

    expect(screen.queryAllByText(/RepoYear/i)).not.toHaveLength(0);
    expect(document.querySelector(".calendar-heat-map"))
      .not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Session expired/i))
        .toBeInTheDocument();
    }, { timeout: 500 });
  });

  it("should refresh if the token is expired", async () => {
    localStorage.setItem(
      "repoyear_github_token_data",
      JSON.stringify(mockTokenData("expired-original", "good-refresh")),
    );
    renderApp();

    expect(screen.queryByText(/Loading/i)).toBeInTheDocument();

    await waitFor(() => {
      const { name } = fixtureData[0] as Contributions;
      expect(screen.getByText("RepoYear:")).toBeInTheDocument();
      expect(screen.getByText(name)).toBeInTheDocument();

      expect(document.querySelector(".calendar-heat-map"))
        .toBeInTheDocument();
    }, { timeout: 500 });

    await waitFor(() => {
      expect(screen.queryByText(/Loading contributions/i)).not
        .toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it("should load and render contributions from fixture data", async () => {
    localStorage.setItem(
      "repoyear_github_token_data",
      JSON.stringify(mockTokenData()),
    );
    renderApp();

    expect(screen.queryByText(/Loading/i)).toBeInTheDocument();

    await waitFor(() => {
      const { name } = fixtureData[0] as Contributions;
      expect(screen.getByText("RepoYear:")).toBeInTheDocument();
      expect(screen.getByText(name)).toBeInTheDocument();

      expect(document.querySelector(".calendar-heat-map"))
        .toBeInTheDocument();
    }, { timeout: 500 });

    await waitFor(() => {
      expect(screen.queryByText(/Loading contributions/i)).not
        .toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
