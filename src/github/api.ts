import { Octokit } from "@octokit/core";
import type {
  CommitContributionsByRepository,
  ContributionCalendar,
  CreatedPullRequestContribution,
  CreatedRepositoryContribution,
  Maybe,
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

export class GitHub {
  readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: `token ${token}` });
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async graphqlViewer(query: string, variables: { [key: string]: any } = {}) {
    const { viewer } = await this.octokit.graphql<{ viewer: User }>({
      query,
      ...variables,
    });
    return viewer;
  }

  async *queryBase(): AsyncGenerator<Contributions> {
    const query = `query (
      $cursor1:String = null,
      $cursor2:String = null,
      $cursor3:String = null,
    ) {
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
            commitContributionsByRepository(maxRepositories: 50) {
              repository {
                isFork
                isPrivate
                url
              }
              contributions(first: 50, after: $cursor1) {
                nodes {
                  commitCount
                  isRestricted
                  occurredAt
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
            pullRequestContributions(first: 50, after: $cursor2) {
              nodes {
                isRestricted
                occurredAt
                pullRequest {
                  repository {
                    isFork
                    isPrivate
                    url
                  }
                  url
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
            repositoryContributions(first: 50, after: $cursor3) {
              nodes {
                isRestricted
                occurredAt
                repository {
                  isFork
                  isPrivate
                  url
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }`;
    const viewer = await this.graphqlViewer(query);
    const collection = viewer.contributionsCollection;
    const contributions = {
      login: viewer.login,
      name: viewer.name || "",
      calendar: collection.contributionCalendar,
      commits: collection.commitContributionsByRepository,
      prs: cleanNodes(collection.pullRequestContributions.nodes),
      repositories: cleanNodes(collection.repositoryContributions.nodes),
    };

    // Yield initial data
    yield contributions;

    let pageInfo1 = collection.commitContributionsByRepository.find((
      { contributions },
    ) => contributions.pageInfo.hasNextPage)?.contributions.pageInfo;
    let pageInfo2 = collection.pullRequestContributions.pageInfo;
    let pageInfo3 = collection.repositoryContributions.pageInfo;
    while (
      pageInfo1?.hasNextPage || pageInfo2.hasNextPage || pageInfo3.hasNextPage
    ) {
      const results = await this.graphqlViewer(
        query,
        { cursor1: pageInfo1?.endCursor, cursor2: pageInfo2.endCursor },
      );

      const collection = results.contributionsCollection;
      if (pageInfo1?.hasNextPage) {
        // Only load data if the last result wasn’t the last page.
        pageInfo1 = collection
          .commitContributionsByRepository.find(({ contributions }) =>
            contributions.pageInfo.hasNextPage
          )?.contributions.pageInfo;
        contributions.commits.push(
          ...collection.commitContributionsByRepository,
        );
      }

      if (pageInfo2.hasNextPage) {
        // Only load data if the last result wasn’t the last page.
        const { nodes, pageInfo } = collection.pullRequestContributions;
        contributions.prs.push(...cleanNodes(nodes));
        pageInfo2 = pageInfo;
      }

      if (pageInfo3.hasNextPage) {
        // Only load data if the last result wasn’t the last page.
        const { nodes, pageInfo } = collection.repositoryContributions;
        contributions.repositories.push(...cleanNodes(nodes));
        pageInfo3 = pageInfo;
      }

      // Yield updated data after each page load
      yield contributions;
    }
  }
}

export function cleanNodes<NodeType>(
  nodes: Maybe<Maybe<NodeType>[]> | undefined,
): NodeType[] {
  return (nodes || []).filter((node) => node !== null && node !== undefined);
}

export interface Contributions {
  login: string;
  name: string;
  calendar: ContributionCalendar;
  commits: CommitContributionsByRepository[];
  prs: CreatedPullRequestContribution[];
  repositories: CreatedRepositoryContribution[];
}
