import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableMCP } from "workers-mcp";
import { z } from "zod";
import * as repository from "./operations/repository.js";
import * as files from "./operations/files.js";
import * as issues from "./operations/issues.js";
import * as pulls from "./operations/pulls.js";
import * as branches from "./operations/branches.js";
import * as search from "./operations/search.js";
import * as commits from "./operations/commits.js";
import {
  isGitHubError,
  GitHubError,
  GitHubRateLimitError,
} from "./common/errors.js";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  ASSETS: Fetcher;
  GITHUB_PERSONAL_ACCESS_TOKEN: string;
}

// Helper function to format GitHub errors
function formatGitHubError(error: GitHubError): string {
  let message = `GitHub API Error: ${error.message}`;

  if (error.name === "GitHubValidationError") {
    message = `Validation Error: ${error.message}`;
    if (error.response) {
      message += `\nDetails: ${JSON.stringify(error.response)}`;
    }
  } else if (error.name === "GitHubResourceNotFoundError") {
    message = `Not Found: ${error.message}`;
  } else if (error.name === "GitHubAuthenticationError") {
    message = `Authentication Failed: ${error.message}`;
  } else if (error.name === "GitHubPermissionError") {
    message = `Permission Denied: ${error.message}`;
  } else if (error.name === "GitHubRateLimitError") {
    const rateLimitError = error as GitHubRateLimitError;
    message = `Rate Limit Exceeded: ${
      error.message
    }\nResets at: ${rateLimitError.resetAt.toISOString()}`;
  } else if (error.name === "GitHubConflictError") {
    message = `Conflict: ${error.message}`;
  }

  return message;
}

// Define GitHub request options interface
interface GitHubRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export class MCPGitHubServer extends DurableMCP {
  server = new McpServer({
    name: "GitHub",
    version: "1.0.0",
  });

  private BRAVE_API_KEY: string;
  private GITHUB_PERSONAL_ACCESS_TOKEN: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.BRAVE_API_KEY = env.BRAVE_API_KEY;
    this.GITHUB_PERSONAL_ACCESS_TOKEN = env.GITHUB_PERSONAL_ACCESS_TOKEN;

    if (!this.BRAVE_API_KEY) {
      console.error("Error: BRAVE_API_KEY environment variable is required");
      throw new Error("BRAVE_API_KEY environment variable is required");
    }

    if (!this.GITHUB_PERSONAL_ACCESS_TOKEN) {
      console.error(
        "Error: GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
      );
      throw new Error(
        "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required"
      );
    }

    // No need to set process.env as it's not available in Cloudflare Workers
    // We'll handle the token in a different way or let the operation utils use env vars directly
  }

  private async githubRequest(url: string, options: GitHubRequestOptions = {}) {
    const headers = {
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.GITHUB_PERSONAL_ACCESS_TOKEN}`,
      ...options.headers,
    };

    return fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  // Create a helper method to handle optional string parameters
  private getStringParam(value: string | undefined): string {
    if (value === undefined) {
      throw new Error("Required string parameter is undefined");
    }
    return value;
  }

  async init() {
    // Add GitHub repository search tool
    this.server.tool(
      "search_repositories",
      "Search for GitHub repositories using GitHub's search syntax",
      {
        query: z.string().describe("Search query (see GitHub search syntax)"),
        page: z
          .number()
          .optional()
          .describe("Page number for pagination (default: 1)"),
        perPage: z
          .number()
          .optional()
          .describe("Number of results per page (default: 30, max: 100)"),
      },
      async ({ query, page, perPage }) => {
        try {
          const results = await repository.searchRepositories(
            query,
            page,
            perPage
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub create repository tool
    this.server.tool(
      "create_repository",
      "Create a new GitHub repository in your account or organization",
      {
        name: z.string().describe("Repository name"),
        description: z.string().optional().describe("Repository description"),
        private: z
          .boolean()
          .optional()
          .describe("Whether the repository should be private"),
        autoInit: z.boolean().optional().describe("Initialize with README.md"),
      },
      async (options) => {
        try {
          const result = await repository.createRepository(options);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub fork repository tool
    this.server.tool(
      "fork_repository",
      "Fork an existing GitHub repository to your account or organization",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        organization: z
          .string()
          .optional()
          .describe(
            "Optional: organization to fork to (defaults to your personal account)"
          ),
      },
      async ({ owner, repo, organization }) => {
        try {
          const result = await repository.forkRepository(
            owner,
            repo,
            organization
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub get file contents tool
    this.server.tool(
      "get_file_contents",
      "Retrieve the contents of a specific file from a GitHub repository",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path within the repository"),
        branch: z
          .string()
          .optional()
          .describe("Branch name (default: repository's default branch)"),
      },
      async ({ owner, repo, path, branch }) => {
        try {
          const contents = await files.getFileContents(
            owner,
            repo,
            path,
            branch
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(contents, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub create or update file tool
    this.server.tool(
      "create_or_update_file",
      "Create a new file or update an existing file in a GitHub repository",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        path: z.string().describe("File path within the repository"),
        content: z.string().describe("File content (will be Base64 encoded)"),
        message: z.string().describe("Commit message"),
        branch: z
          .string()
          .describe("Branch name (default: repository's default branch)"),
        sha: z
          .string()
          .optional()
          .describe("SHA of file to update (required for updates)"),
      },
      async ({ owner, repo, path, content, message, branch, sha }) => {
        try {
          const result = await files.createOrUpdateFile(
            owner,
            repo,
            path,
            content,
            message,
            branch,
            sha
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub push files tool
    this.server.tool(
      "push_files",
      "Push multiple files to a GitHub repository in a single commit",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        branch: z.string().describe("Branch to push to"),
        message: z.string().describe("Commit message"),
        files: z
          .array(
            z.object({
              path: z.string().describe("File path within the repository"),
              content: z.string().describe("File content"),
              mode: z
                .string()
                .optional()
                .describe("File mode (default: '100644' for normal file)"),
              type: z.string().optional().describe("Type (default: 'blob')"),
            })
          )
          .describe("Array of files to push"),
      },
      async ({ owner, repo, branch, files: fileList, message }) => {
        try {
          const result = await files.pushFiles(
            owner,
            repo,
            branch,
            fileList,
            message
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub create branch tool
    this.server.tool(
      "create_branch",
      "Create a new branch in a GitHub repository from an existing branch",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        branch: z.string().describe("New branch name"),
        from_branch: z.string().describe("Source branch to create from"),
      },
      async ({ owner, repo, branch, from_branch }) => {
        try {
          const result = await branches.createBranchFromRef(
            owner,
            repo,
            branch,
            from_branch
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub list issues tool
    this.server.tool(
      "list_issues",
      "List issues in a GitHub repository with filtering options",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Issue state (default: open)"),
        sort: z
          .enum(["created", "updated", "comments"])
          .optional()
          .describe("Sort criteria (default: created)"),
        direction: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction (default: desc)"),
        page: z
          .number()
          .optional()
          .describe("Page number for pagination (default: 1)"),
        perPage: z
          .number()
          .optional()
          .describe("Number of results per page (default: 30, max: 100)"),
      },
      async ({ owner, repo, ...options }) => {
        try {
          const result = await issues.listIssues(owner, repo, options);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub create issue tool
    this.server.tool(
      "create_issue",
      "Create a new issue in a GitHub repository",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().describe("Issue body"),
        labels: z.array(z.string()).optional().describe("Issue labels"),
        assignees: z
          .array(z.string())
          .optional()
          .describe("Users to assign to this issue"),
      },
      async ({ owner, repo, ...options }) => {
        try {
          const issue = await issues.createIssue(owner, repo, options);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(issue, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub get issue tool
    this.server.tool(
      "get_issue",
      "Retrieve details of a specific issue in a GitHub repository",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        issue_number: z.number().describe("Issue number"),
      },
      async ({ owner, repo, issue_number }) => {
        try {
          const issue = await issues.getIssue(owner, repo, issue_number);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(issue, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub create pull request tool
    this.server.tool(
      "create_pull_request",
      "Create a new pull request to merge changes between branches",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        head: z.string().describe("Branch name with the changes"),
        base: z.string().describe("Branch name to merge changes into"),
        title: z.string().describe("Pull request title"),
        body: z.string().describe("Pull request description"),
        draft: z.boolean().optional().describe("Whether this PR is a draft"),
      },
      async (options) => {
        try {
          const pullRequest = await pulls.createPullRequest(options);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(pullRequest, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub get pull request tool
    this.server.tool(
      "get_pull_request",
      "Retrieve details of a specific pull request in a GitHub repository",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
      },
      async ({ owner, repo, pull_number }) => {
        try {
          const pullRequest = await pulls.getPullRequest(
            owner,
            repo,
            pull_number
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(pullRequest, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub list pull requests tool
    this.server.tool(
      "list_pull_requests",
      "List pull requests in a GitHub repository with filtering options",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Pull request state (default: open)"),
        sort: z
          .enum(["created", "updated", "popularity", "long-running"])
          .optional()
          .describe("Sort criteria (default: created)"),
        direction: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort direction (default: desc)"),
        base: z.string().optional().describe("Filter by base branch name"),
        head: z.string().optional().describe("Filter by head branch name"),
      },
      async ({ owner, repo, ...options }) => {
        try {
          const pullRequests = await pulls.listPullRequests(
            owner,
            repo,
            options
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(pullRequests, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub list commits tool
    this.server.tool(
      "list_commits",
      "List commits in a GitHub repository with filtering options",
      {
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        sha: z
          .string()
          .optional()
          .describe("Branch or commit SHA to start listing commits from"),
        page: z
          .number()
          .optional()
          .describe("Page number for pagination (default: 1)"),
        perPage: z
          .number()
          .optional()
          .describe("Number of results per page (default: 30, max: 100)"),
      },
      async ({ owner, repo, sha, page, perPage }) => {
        try {
          const results = await commits.listCommits(
            owner,
            repo,
            page,
            perPage,
            sha
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub search code tool (fixed parameter naming)
    this.server.tool(
      "search_code",
      "Search for code across GitHub repositories using GitHub's search syntax",
      {
        q: z.string().describe("Search query (see GitHub search syntax)"),
        sort: z
          .enum(["indexed", ""])
          .optional()
          .describe("Sort criteria ('indexed' or empty for best match)"),
        order: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort order (default varies by sort)"),
        per_page: z
          .number()
          .optional()
          .describe("Results per page (default: 30, max: 100)"),
        page: z.number().optional().describe("Page number"),
      },
      async (args) => {
        try {
          const results = await search.searchCode(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub search issues tool (fixed parameter naming)
    this.server.tool(
      "search_issues",
      "Search for issues and pull requests across GitHub using GitHub's search syntax",
      {
        q: z.string().describe("Search query (see GitHub search syntax)"),
        sort: z
          .enum([
            "comments",
            "reactions",
            "reactions-+1",
            "reactions--1",
            "reactions-smile",
            "reactions-thinking_face",
            "reactions-heart",
            "reactions-tada",
            "interactions",
            "created",
            "updated",
          ])
          .optional()
          .describe("Sort criteria"),
        order: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort order (default varies by sort)"),
        per_page: z
          .number()
          .optional()
          .describe("Results per page (default: 30, max: 100)"),
        page: z.number().optional().describe("Page number"),
      },
      async (args) => {
        try {
          const results = await search.searchIssues(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );

    // Add GitHub search users tool
    this.server.tool(
      "search_users",
      "Search for users across GitHub using GitHub's search syntax",
      {
        q: z.string().describe("Search query (see GitHub search syntax)"),
        sort: z
          .enum(["followers", "repositories", "joined"])
          .optional()
          .describe("Sort criteria"),
        order: z
          .enum(["asc", "desc"])
          .optional()
          .describe("Sort order (default varies by sort)"),
        per_page: z
          .number()
          .optional()
          .describe("Results per page (default: 30, max: 100)"),
        page: z.number().optional().describe("Page number"),
      },
      async (args) => {
        try {
          const results = await search.searchUsers(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        } catch (error) {
          if (isGitHubError(error)) {
            throw new Error(formatGitHubError(error));
          }
          throw error;
        }
      }
    );
  }
}

// Export MCPMathServer for compatibility with the build system
export const MCPMathServer = MCPGitHubServer;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const router = MCPMathServer.mount("/mcp");

    if (
      url.pathname.startsWith("/mcp") ||
      url.pathname.startsWith("/sse/message")
    ) {
      return router.fetch(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
