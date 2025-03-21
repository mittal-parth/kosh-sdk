import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableMCP } from "workers-mcp";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  ASSETS: Fetcher;
  BRAVE_API_KEY: string;
}

const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000,
};

const requestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now(),
};

function checkRateLimit() {
  const now = Date.now();
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }
  if (
    requestCount.second >= RATE_LIMIT.perSecond ||
    requestCount.month >= RATE_LIMIT.perMonth
  ) {
    throw new Error("Rate limit exceeded");
  }
  requestCount.second++;
  requestCount.month++;
}

interface BraveWeb {
  web?: {
    results?: Array<{
      title: string;
      description: string;
      url: string;
      language?: string;
      published?: string;
      rank?: number;
    }>;
  };
}

export class MCPMathServer extends DurableMCP {
  server = new McpServer({
    name: "Brave Search",
    version: "1.0.0",
  });

  private BRAVE_API_KEY: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.BRAVE_API_KEY = env.BRAVE_API_KEY;

    if (!this.BRAVE_API_KEY) {
      console.error("Error: BRAVE_API_KEY environment variable is required");
      throw new Error("BRAVE_API_KEY environment variable is required");
    }
  }

  private async performWebSearch(
    query: string,
    count: number = 10,
    offset: number = 0
  ) {
    checkRateLimit();
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", Math.min(count, 20).toString());
    url.searchParams.set("offset", offset.toString());

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Brave API error: ${response.status} ${
          response.statusText
        }\n${await response.text()}`
      );
    }

    const data = (await response.json()) as BraveWeb;

    const results = (data.web?.results || []).map((result) => ({
      title: result.title || "",
      description: result.description || "",
      url: result.url || "",
    }));

    return results;
  }

  async init() {
    this.server.tool(
      "brave_web_search",
      {
        query: z.string().describe("Search query (max 400 chars, 50 words)"),
        count: z
          .number()
          .default(10)
          .describe("Number of results (1-20, default 10)"),
        offset: z
          .number()
          .default(0)
          .describe("Pagination offset (max 9, default 0)"),
      },
      async ({ query, count, offset }) => {
        const results = await this.performWebSearch(query, count, offset);

        return {
          content: [
            {
              type: "text",
              text: results
                .map(
                  (r) =>
                    `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
                )
                .join("\n\n"),
            },
          ],
        };
      }
    );
  }
}

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
