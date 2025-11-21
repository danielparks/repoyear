import { Octokit } from "@octokit/core";
import { paginateGraphQL } from "@octokit/plugin-paginate-graphql";
import type { paginateGraphQLInterface } from "@octokit/plugin-paginate-graphql";
import type {
  CommitContributionsByRepository,
  ContributionCalendar,
  CreatedRepositoryContributionConnection,
  User,
} from "./gql.ts";

export function redirectToLogin(redirectUrl: string) {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "GitHub Client ID not found; make sure VITE_GITHUB_CLIENT_ID is set in " +
        " your .env file.",
    );
  }

  const redirect = new URL("https://github.com/login/oauth/authorize");
  redirect.searchParams.set("client_id", clientId);
  redirect.searchParams.set("redirect_uri", redirectUrl);
  redirect.searchParams.set("scope", "repo");
  document.location.href = redirect.href;
}

export async function getToken(code: string, backendUrl: string) {
  const url = new URL("/api/oauth/callback", backendUrl);
  url.searchParams.set("code", code);
  const response = await fetch(url);
  const data = await response.json() as { access_token?: string };
  return data.access_token;
}

export type OctokitWithPagination = Octokit & paginateGraphQLInterface;

export class GitHub {
  readonly octokit: OctokitWithPagination;

  constructor(token: string) {
    const MyOctokit = Octokit.plugin(paginateGraphQL);
    this.octokit = new MyOctokit({ auth: `token ${token}` });
  }

  installRateLimitReport() {
    let printJob: number | null = null;
    this.octokit.hook.after("request", (response) => {
      const limit = response.headers["x-ratelimit-limit"] || "";
      const reset = response.headers["x-ratelimit-reset"];
      const resource = response.headers["x-ratelimit-resource"];
      const used = (response.headers["x-ratelimit-used"] || "").toString();

      // Only print the rate limit info after a batch of requests.
      if (printJob) {
        clearTimeout(printJob);
      }
      printJob = setTimeout(() => {
        printJob = null;
        console.log(`Rate limit used: ${used}/${limit}`, resource);
        if (reset) {
          const seconds = Number.parseInt(reset, 10);
          if (!Number.isNaN(seconds)) {
            console.log("Rate limit resets:", new Date(seconds * 1000));
          }
        }
      }, 1000);
    });
  }

  async queryBase(): Promise<Contributions> {
    const { viewer } = await this.octokit.graphql<{ viewer: User }>({
      query: `query {
        viewer {
          login
          name
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  contributionLevel
                  date
                }
              }
            }
            commitContributionsByRepository(maxRepositories: 25) {
              repository {
                isFork
                isPrivate
                url
              }
              contributions(last: 50) {
                nodes {
                  commitCount
                  occurredAt
                  isRestricted
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
            repositoryContributions(last: 100) {
              nodes {
                isRestricted
                occurredAt
                repository {
                  isFork
                  isPrivate
                  url
                }
                url
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }`,
    });

    return {
      login: viewer.login,
      name: viewer.name || "",
      calendar: viewer.contributionsCollection.contributionCalendar,
      commits: viewer.contributionsCollection.commitContributionsByRepository,
      repositories: viewer.contributionsCollection.repositoryContributions,
    };
  }
}

export interface Contributions {
  login: string;
  name: string;
  calendar: ContributionCalendar;
  commits: CommitContributionsByRepository[];
  repositories: CreatedRepositoryContributionConnection;
}
