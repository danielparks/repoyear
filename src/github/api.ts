import { Octokit } from "@octokit/core";
import type {
  CommitContributionsByRepository,
  ContributionCalendar,
  CreatedIssueContribution,
  CreatedPullRequestContribution,
  CreatedPullRequestReviewContribution,
  CreatedRepositoryContribution,
  Maybe,
  PageInfo,
  User,
} from "./gql.ts";

/**
 * Simple hash function to generate a version string from the query.
 * This ensures the cache key changes automatically when the query is modified.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

/**
 * GraphQL query template for fetching GitHub contributions.
 * FIXME: Consider adding joinedGitHubContribution
 * FIXME: Check contributionYears or hasActivityInThePast?
 * FIXME: Does mostRecentCollectionWithActivity catch recent changes (e.g.
 *        deleting a repo) that affect the past?
 */
export const CONTRIBUTIONS_QUERY_TEMPLATE =
  `query ( $includeCommits:Boolean!, {{CURSORS}} ) {
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
      commitContributionsByRepository(maxRepositories: 100)
        @include(if: $includeCommits)
      {
        repository {
          isFork
          isPrivate
          url
        }
        contributions(first: 100, after: $commitCursor) {
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
      issueContributions(first: 100, after: $issueCursor) {
        nodes {
          isRestricted
          occurredAt
          issue {
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
      pullRequestContributions(first: 100, after: $prCursor) {
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
      pullRequestReviewContributions(first: 100, after: $reviewCursor) {
        nodes {
          isRestricted
          occurredAt
          pullRequestReview {
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
      repositoryContributions(first: 100, after: $repoCursor) {
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

/**
 * Cache version derived from the query template.
 * This value changes automatically when CONTRIBUTIONS_QUERY_TEMPLATE is modified.
 */
export const QUERY_VERSION = simpleHash(CONTRIBUTIONS_QUERY_TEMPLATE);

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
        let resetMessage = "";
        if (reset) {
          const seconds = Number.parseInt(reset, 10);
          if (!Number.isNaN(seconds)) {
            resetMessage = ` (resets: ${new Date(seconds * 1000).toString()})`;
          }
        }
        console.log(
          `Rate limit used: ${used}/${limit}${resetMessage}`,
          resource,
        );
      }, 1000);
    });
  }

  async *queryBase(): AsyncGenerator<Contributions> {
    const cursors = [
      "commitCursor",
      "issueCursor",
      "prCursor",
      "repoCursor",
      "reviewCursor",
    ];

    const pageInfo = Object.fromEntries(
      cursors.map(
        (name) => [name, { endCursor: null, hasNextPage: true }],
      ),
    ) as Record<string, PageInfo>;

    while (!Object.values(pageInfo).every((info) => !info.hasNextPage)) {
      const parameters = cursors.map((name) => `$${name}:String`).join(", ");
      const query = CONTRIBUTIONS_QUERY_TEMPLATE.replace(
        "{{CURSORS}}",
        parameters,
      );

      const { viewer } = await this.octokit.graphql<{ viewer: User }>({
        query,
        includeCommits: pageInfo.commitCursor.hasNextPage,
        ...Object.fromEntries(
          cursors.map((name) => [name, pageInfo[name].endCursor]),
        ),
      });

      // Yield update
      const collection = viewer.contributionsCollection;
      yield {
        login: viewer.login,
        name: viewer.name || "",
        calendar: collection.contributionCalendar,
        // The following isn’t actually always truthy.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        commits: collection.commitContributionsByRepository || [],
        issues: cleanNodes(collection.issueContributions.nodes),
        prs: cleanNodes(collection.pullRequestContributions.nodes),
        repositories: cleanNodes(collection.repositoryContributions.nodes),
        reviews: cleanNodes(collection.pullRequestReviewContributions.nodes),
      };

      if (pageInfo.commitCursor.hasNextPage) {
        const newPageInfo = collection
          .commitContributionsByRepository
          .find(({ contributions }) => contributions.pageInfo.hasNextPage)
          ?.contributions
          .pageInfo;
        if (newPageInfo) {
          pageInfo.commitCursor = newPageInfo;
        } else {
          // FIXME? why does this require hasPreviousPage?
          pageInfo.commitCursor = {
            endCursor: null,
            hasNextPage: false,
            hasPreviousPage: false,
          };
        }
      }

      if (pageInfo.issueCursor.hasNextPage) {
        pageInfo.issueCursor = collection.issueContributions.pageInfo;
      }

      if (pageInfo.prCursor.hasNextPage) {
        pageInfo.prCursor = collection.pullRequestContributions.pageInfo;
      }

      if (pageInfo.repoCursor.hasNextPage) {
        pageInfo.repoCursor = collection.repositoryContributions.pageInfo;
      }

      if (pageInfo.reviewCursor.hasNextPage) {
        pageInfo.reviewCursor =
          collection.pullRequestReviewContributions.pageInfo;
      }
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
  issues: CreatedIssueContribution[];
  prs: CreatedPullRequestContribution[];
  repositories: CreatedRepositoryContribution[];
  reviews: CreatedPullRequestReviewContribution[];
}
