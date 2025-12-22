import { Octokit } from "@octokit/core";
import type {
  GraphQlQueryResponseData,
  GraphqlResponseError,
} from "@octokit/graphql";
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

// Type for errors raised by query.
// FIXME correct type?
export type GithubError = GraphqlResponseError<GraphQlQueryResponseData>;

/**
 * GraphQL query template for fetching GitHub contributions.
 * FIXME: Consider adding joinedGitHubContribution
 * FIXME: What about joining an organization (see ~danielparks on 2025-12-04)
 * FIXME: Check contributionYears or hasActivityInThePast?
 * FIXME: Does mostRecentCollectionWithActivity catch recent changes (e.g.
 *        deleting a repo) that affect the past?
 */
export const CONTRIBUTIONS_QUERY_TEMPLATE =
  `query ( $wantSummary:Boolean!, {{PARAMETERS}} ) {
  user: {{ROOT_FIELD}} {
    login
    name
    contributionsCollection {
      contributionCalendar @include(if: $wantSummary) {
        totalContributions
        weeks {
          contributionDays {
            contributionCount
            contributionLevel
            date
          }
        }
      }
      commitContributionsByRepository(maxRepositories: 100) {
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

  async *queryBase(username?: string): AsyncGenerator<Contributions> {
    const cursors = [
      "commitCursor",
      "issueCursor",
      "prCursor",
      "repoCursor",
      "reviewCursor",
    ];

    let wantSummary = true;
    const pageInfo = Object.fromEntries(
      cursors.map(
        (name) => [name, { endCursor: null, hasNextPage: true }],
      ),
    ) as Record<string, PageInfo>;

    while (!Object.values(pageInfo).every((info) => !info.hasNextPage)) {
      let rootField = "viewer";
      const parameters = cursors.map((name) => `$${name}:String`);
      const parameterObject = Object.fromEntries(
        cursors.map((name) => [name, pageInfo[name].endCursor]),
      );

      if (username) {
        rootField = "user(login: $login)";
        parameters.push("$login:String!");
        parameterObject["login"] = username;
      }

      const { user } = await this.octokit.graphql<{ user: User }>({
        query: CONTRIBUTIONS_QUERY_TEMPLATE
          .replace("{{ROOT_FIELD}}", rootField)
          .replace("{{PARAMETERS}}", parameters.join(", ")),
        wantSummary,
        ...parameterObject,
      });

      // Yield update
      const collection = user.contributionsCollection;
      yield {
        login: user.login,
        name: user.name || "",
        calendar: collection.contributionCalendar,
        commits: collection.commitContributionsByRepository,
        issues: cleanNodes(collection.issueContributions.nodes),
        prs: cleanNodes(collection.pullRequestContributions.nodes),
        repositories: cleanNodes(collection.repositoryContributions.nodes),
        reviews: cleanNodes(collection.pullRequestReviewContributions.nodes),
      };

      // Try to request next pages
      wantSummary = false;

      if (pageInfo.commitCursor.hasNextPage) {
        const commits = collection.commitContributionsByRepository;
        pageInfo.commitCursor = (
          // All repos with more data have the same cursor; find the first.
          commits.find(({ contributions }) =>
            contributions.pageInfo.hasNextPage
          ) ||
          // No repos have more data, get the first for a finished cursor.
          commits[0]
        )?.contributions.pageInfo ||
          // No repos; just disable this next iteration.
          { endCursor: null, hasNextPage: false };
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
  calendar?: ContributionCalendar;
  commits: CommitContributionsByRepository[];
  issues: CreatedIssueContribution[];
  prs: CreatedPullRequestContribution[];
  repositories: CreatedRepositoryContribution[];
  reviews: CreatedPullRequestReviewContribution[];
}
