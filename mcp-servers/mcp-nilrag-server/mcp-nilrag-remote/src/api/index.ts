import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DurableMCP } from "workers-mcp";
import { z } from "zod";

export interface Env {
  MCP_OBJECT: DurableObjectNamespace;
  ASSETS: Fetcher;
  NILRAG_API_URL: string;
  NILRAG_ORG_SECRET_KEY: string;
  NILRAG_ORG_DID: string;
  NILAI_API_TOKEN: string;
  NILAI_API_URL: string;
}

interface NilRAGResponse {
  status: string;
  message?: string;
  content?: string;
  chunks_count?: number;
  source?: string;
  model?: string;
  response?: Record<string, unknown>;
}

export class MCPMathServer extends DurableMCP {
  server = new McpServer({
    name: "NilRAG",
    version: "1.0.0",
  });

  private BRAVE_API_KEY: string;
  private NILRAG_API_URL: string;
  private NILRAG_ORG_SECRET_KEY: string;
  private NILRAG_ORG_DID: string;
  private NILAI_API_TOKEN: string;
  private NILAI_API_URL: string;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.NILRAG_API_URL = env.NILRAG_API_URL || "http://localhost:8000";
    this.NILRAG_ORG_SECRET_KEY =
      env.NILRAG_ORG_SECRET_KEY ||
      "b74b05573bd2f0ab32384b798b1897f99364ec7e5a1cfd75e43f5dadd6ea8938";
    this.NILRAG_ORG_DID =
      env.NILRAG_ORG_DID ||
      "did:nil:testnet:nillion16rg02vlv0d0ch8ynv4v7n5kuca09hrxwtzy9cv";
    this.NILAI_API_TOKEN = env.NILAI_API_TOKEN || "Nillion2025";
    this.NILAI_API_URL =
      env.NILAI_API_URL || "https://nilai-a779.nillion.network";

    if (!this.BRAVE_API_KEY) {
      console.error("Error: BRAVE_API_KEY environment variable is required");
      throw new Error("BRAVE_API_KEY environment variable is required");
    }
  }

  private async initializeNilRAG() {
    const url = new URL("/initialize", this.NILRAG_API_URL);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nilrag_org_secret_key: this.NILRAG_ORG_SECRET_KEY,
          nilrag_org_did: this.NILRAG_ORG_DID,
          nilai_api_token: this.NILAI_API_TOKEN,
          nilai_api_url: this.NILAI_API_URL,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `NilRAG initialization failed: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as NilRAGResponse;
      return data;
    } catch (error) {
      console.error("NilRAG initialization error:", error);
      throw error;
    }
  }

  private async uploadToNilRAG(
    fileContent: string,
    chunkSize: number = 50,
    overlap: number = 10
  ) {
    const url = new URL("/upload", this.NILRAG_API_URL);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_content: fileContent,
          chunk_size: chunkSize,
          overlap: overlap,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `NilRAG upload failed: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as NilRAGResponse;
      return data;
    } catch (error) {
      console.error("NilRAG upload error:", error);
      throw error;
    }
  }

  private async queryNilRAG(
    prompt: string,
    model: string = "meta-llama/Llama-3.1-8B-Instruct",
    temperature: number = 0.2,
    maxTokens: number = 2048
  ) {
    const url = new URL("/query", this.NILRAG_API_URL);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt,
          model: model,
          temperature: temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `NilRAG query failed: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as NilRAGResponse;
      return data;
    } catch (error) {
      console.error("NilRAG query error:", error);
      throw error;
    }
  }

  async init() {
    this.server.tool(
      "nilrag_initialize",
      "Initialize the NilRAG system with necessary credentials and configurations",
      {},
      async () => {
        const result = await this.initializeNilRAG();

        return {
          content: [
            {
              type: "text",
              text: `Status: ${result.status}\nMessage: ${
                result.message || ""
              }`,
            },
          ],
        };
      }
    );

    this.server.tool(
      "nilrag_upload",
      "Upload and process text content to the NilRAG system for private information retrieval",
      {
        content: z.string().describe("Text content to upload to nilRAG"),
        chunk_size: z
          .number()
          .default(50)
          .describe("Maximum number of words per chunk (default 50)"),
        overlap: z
          .number()
          .default(10)
          .describe("Number of overlapping words between chunks (default 10)"),
      },
      async ({ content, chunk_size, overlap }) => {
        const result = await this.uploadToNilRAG(content, chunk_size, overlap);

        return {
          content: [
            {
              type: "text",
              text: `Status: ${result.status}\nMessage: ${
                result.message || ""
              }\nChunks: ${result.chunks_count || 0}\nSource: ${
                result.source || ""
              }`,
            },
          ],
        };
      }
    );

    this.server.tool(
      "nilrag_query",
      "Query the NilRAG system to retrieve information while preserving privacy",
      {
        prompt: z
          .string()
          .describe("Query prompt to search in the nilRAG data"),
        model: z
          .string()
          .default("meta-llama/Llama-3.1-8B-Instruct")
          .describe("Model to use for generating responses"),
        temperature: z
          .number()
          .default(0.2)
          .describe("Temperature for response generation (0.0-1.0)"),
        max_tokens: z
          .number()
          .default(2048)
          .describe("Maximum tokens to generate in the response"),
      },
      async ({ prompt, model, temperature, max_tokens }) => {
        const result = await this.queryNilRAG(
          prompt,
          model,
          temperature,
          max_tokens
        );

        return {
          content: [
            {
              type: "text",
              text: result.content || JSON.stringify(result, null, 2),
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
