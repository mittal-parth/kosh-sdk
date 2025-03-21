import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableMCP } from "workers-mcp";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  ASSETS: Fetcher;
  BRAVE_API_KEY: string;
  SLACK_TOKEN: string;
  SLACK_TEAM_ID: string;
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

class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };
  private teamId: string;

  constructor(botToken: string, teamId: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    };
    this.teamId = teamId;
  }

  async getChannels(limit: number = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      types: "public_channel",
      exclude_archived: "true",
      limit: Math.min(limit, 200).toString(),
      team_id: this.teamId,
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(
      `https://slack.com/api/conversations.list?${params}`,
      { headers: this.botHeaders }
    );

    return response.json();
  }

  async postMessage(channel_id: string, text: string): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        text: text,
      }),
    });

    return response.json();
  }

  async postReply(
    channel_id: string,
    thread_ts: string,
    text: string
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        thread_ts: thread_ts,
        text: text,
      }),
    });

    return response.json();
  }

  async addReaction(
    channel_id: string,
    timestamp: string,
    reaction: string
  ): Promise<any> {
    const response = await fetch("https://slack.com/api/reactions.add", {
      method: "POST",
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        timestamp: timestamp,
        name: reaction,
      }),
    });

    return response.json();
  }

  async getChannelHistory(
    channel_id: string,
    limit: number = 10
  ): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      limit: limit.toString(),
    });

    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      { headers: this.botHeaders }
    );

    return response.json();
  }

  async getThreadReplies(channel_id: string, thread_ts: string): Promise<any> {
    const params = new URLSearchParams({
      channel: channel_id,
      ts: thread_ts,
    });

    const response = await fetch(
      `https://slack.com/api/conversations.replies?${params}`,
      { headers: this.botHeaders }
    );

    return response.json();
  }

  async getUsers(limit: number = 100, cursor?: string): Promise<any> {
    const params = new URLSearchParams({
      limit: Math.min(limit, 200).toString(),
      team_id: this.teamId,
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const response = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: this.botHeaders,
    });

    return response.json();
  }

  async getUserProfile(user_id: string): Promise<any> {
    const params = new URLSearchParams({
      user: user_id,
      include_labels: "true",
    });

    const response = await fetch(
      `https://slack.com/api/users.profile.get?${params}`,
      { headers: this.botHeaders }
    );

    return response.json();
  }
}

export class MCPMathServer extends DurableMCP {
  server = new McpServer({
    name: "Brave Search",
    version: "1.0.0",
  });

  private BRAVE_API_KEY: string;
  private SLACK_TOKEN: string;
  private SLACK_TEAM_ID: string;
  private slackClient: SlackClient;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.BRAVE_API_KEY = env.BRAVE_API_KEY;
    this.SLACK_TOKEN = env.SLACK_TOKEN || "";
    this.SLACK_TEAM_ID = env.SLACK_TEAM_ID || "";

    if (!this.BRAVE_API_KEY) {
      console.error("Error: BRAVE_API_KEY environment variable is required");
      throw new Error("BRAVE_API_KEY environment variable is required");
    }

    if (this.SLACK_TOKEN && this.SLACK_TEAM_ID) {
      this.slackClient = new SlackClient(this.SLACK_TOKEN, this.SLACK_TEAM_ID);
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

    // Only register Slack tools if we have a token
    if (this.SLACK_TOKEN && this.SLACK_TEAM_ID) {
      this.server.tool(
        "slack_list_channels",
        {
          limit: z
            .number()
            .default(100)
            .describe(
              "Maximum number of channels to return (default 100, max 200)"
            ),
          cursor: z
            .string()
            .optional()
            .describe("Pagination cursor for next page of results"),
        },
        async ({ limit, cursor }) => {
          try {
            const response = await this.slackClient.getChannels(limit, cursor);

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            const formattedChannels = response.channels
              .map((channel: any) => `#${channel.name} (ID: ${channel.id})`)
              .join("\n");

            const result = `Channels:\n${formattedChannels}\n\n${
              response.response_metadata?.next_cursor
                ? `Next cursor: ${response.response_metadata.next_cursor}`
                : "No more channels"
            }`;

            return {
              content: [{ type: "text", text: result }],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error listing channels: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_post_message",
        {
          channel_id: z.string().describe("The ID of the channel to post to"),
          text: z.string().describe("The message text to post"),
        },
        async ({ channel_id, text }) => {
          try {
            const response = await this.slackClient.postMessage(
              channel_id,
              text
            );

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Message sent successfully to channel ${channel_id}.\nTimestamp: ${response.ts}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error posting message: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_reply_to_thread",
        {
          channel_id: z
            .string()
            .describe("The ID of the channel containing the thread"),
          thread_ts: z
            .string()
            .describe(
              "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it."
            ),
          text: z.string().describe("The reply text"),
        },
        async ({ channel_id, thread_ts, text }) => {
          try {
            const response = await this.slackClient.postReply(
              channel_id,
              thread_ts,
              text
            );

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Reply sent successfully to thread ${thread_ts} in channel ${channel_id}.\nTimestamp: ${response.ts}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error posting reply: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_add_reaction",
        {
          channel_id: z
            .string()
            .describe("The ID of the channel containing the message"),
          timestamp: z
            .string()
            .describe("The timestamp of the message to react to"),
          reaction: z
            .string()
            .describe("The name of the emoji reaction (without ::)"),
        },
        async ({ channel_id, timestamp, reaction }) => {
          try {
            const response = await this.slackClient.addReaction(
              channel_id,
              timestamp,
              reaction
            );

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            return {
              content: [
                {
                  type: "text",
                  text: `Added reaction :${reaction}: to message at ${timestamp} in channel ${channel_id}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error adding reaction: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_get_channel_history",
        {
          channel_id: z.string().describe("The ID of the channel"),
          limit: z
            .number()
            .default(10)
            .describe("Number of messages to retrieve (default 10)"),
        },
        async ({ channel_id, limit }) => {
          try {
            const response = await this.slackClient.getChannelHistory(
              channel_id,
              limit
            );

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            const formattedMessages = response.messages
              .map((msg: any) => {
                const timestamp = new Date(
                  parseInt(msg.ts.split(".")[0]) * 1000
                ).toISOString();
                return `[${timestamp}] ${msg.user || "Unknown"}: ${msg.text}\n${
                  msg.thread_ts ? `Thread timestamp: ${msg.thread_ts}\n` : ""
                }Message timestamp: ${msg.ts}`;
              })
              .join("\n\n");

            return {
              content: [
                {
                  type: "text",
                  text: formattedMessages || "No messages found in channel",
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting channel history: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_get_thread_replies",
        {
          channel_id: z
            .string()
            .describe("The ID of the channel containing the thread"),
          thread_ts: z
            .string()
            .describe(
              "The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it."
            ),
        },
        async ({ channel_id, thread_ts }) => {
          try {
            const response = await this.slackClient.getThreadReplies(
              channel_id,
              thread_ts
            );

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            const formattedReplies = response.messages
              .slice(1) // Skip the parent message
              .map((msg: any) => {
                const timestamp = new Date(
                  parseInt(msg.ts.split(".")[0]) * 1000
                ).toISOString();
                return `[${timestamp}] ${msg.user || "Unknown"}: ${
                  msg.text
                }\nMessage timestamp: ${msg.ts}`;
              })
              .join("\n\n");

            return {
              content: [
                {
                  type: "text",
                  text: formattedReplies || "No replies found in thread",
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting thread replies: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_get_users",
        {
          cursor: z
            .string()
            .optional()
            .describe("Pagination cursor for next page of results"),
          limit: z
            .number()
            .default(100)
            .describe(
              "Maximum number of users to return (default 100, max 200)"
            ),
        },
        async ({ cursor, limit }) => {
          try {
            const response = await this.slackClient.getUsers(limit, cursor);

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            const formattedUsers = response.members
              .map((user: any) => {
                const realName =
                  user.profile?.real_name || user.real_name || "Unknown";
                return `${realName} (ID: ${user.id}, @${user.name})`;
              })
              .join("\n");

            const result = `Users:\n${formattedUsers}\n\n${
              response.response_metadata?.next_cursor
                ? `Next cursor: ${response.response_metadata.next_cursor}`
                : "No more users"
            }`;

            return {
              content: [{ type: "text", text: result }],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error listing users: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      this.server.tool(
        "slack_get_user_profile",
        {
          user_id: z.string().describe("The ID of the user"),
        },
        async ({ user_id }) => {
          try {
            const response = await this.slackClient.getUserProfile(user_id);

            if (!response.ok) {
              throw new Error(`Slack API error: ${response.error}`);
            }

            const profile = response.profile;
            const formattedProfile = `
User Profile for ${profile.real_name} (@${profile.display_name || "unknown"})
ID: ${user_id}
Email: ${profile.email || "Not available"}
Title: ${profile.title || "Not set"}
Phone: ${profile.phone || "Not set"}
Status: ${profile.status_text || "No status"} ${profile.status_emoji || ""}
Time Zone: ${profile.tz || "Not set"}
`;

            return {
              content: [{ type: "text", text: formattedProfile }],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting user profile: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );
    }

    this.server.tool(
      "add",
      {
        a: z.number(),
        b: z.number(),
      },
      async ({ a, b }) => {
        return {
          content: [{ type: "text", text: String(a + b) }],
        };
      }
    );

    // ... rest of the math tools ...
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
