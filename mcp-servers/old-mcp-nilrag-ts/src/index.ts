#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the Python server directory and bridge script
const PYTHON_SERVER_PATH = path.resolve(__dirname, '../../mcp-nilrag');
let BRIDGE_SCRIPT_PATH = path.resolve(__dirname, './nilrag_bridge.py');

// Check if bridge script exists at the current location (for development)
// If not, try to locate it in the src directory (for running with ts-node)
if (!fs.existsSync(BRIDGE_SCRIPT_PATH) && fs.existsSync(path.resolve(__dirname, '../src/nilrag_bridge.py'))) {
  console.log('Using bridge script from src directory');
  BRIDGE_SCRIPT_PATH = path.resolve(__dirname, '../src/nilrag_bridge.py');
}

// Determine the virtual environment path
let PYTHON_VENV_PATH = '';
if (fs.existsSync(path.join(PYTHON_SERVER_PATH, 'venv'))) {
  PYTHON_VENV_PATH = path.join(PYTHON_SERVER_PATH, 'venv');
} else if (fs.existsSync(path.join(PYTHON_SERVER_PATH, '.venv'))) {
  PYTHON_VENV_PATH = path.join(PYTHON_SERVER_PATH, '.venv');
} else {
  console.warn('No virtual environment found at venv or .venv, using system Python');
}

// Define tool names as enum
enum NilRAGTools {
  INITIALIZE = "initialize",
  UPLOAD_OWNER_DATA = "upload_owner_data",
  CLIENT_QUERY = "client_query"
}

// Define the tools
const INITIALIZE_TOOL: Tool = {
  name: NilRAGTools.INITIALIZE,
  description: "Initialize nilRAG schema and query",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

const UPLOAD_OWNER_DATA_TOOL: Tool = {
  name: NilRAGTools.UPLOAD_OWNER_DATA,
  description: "Upload data to nilDB",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Optional path to file to upload"
      },
      file_content: {
        type: "string",
        description: "Optional content to upload directly"
      },
      chunk_size: {
        type: "number",
        description: "Maximum number of words per chunk",
        default: 50
      },
      overlap: {
        type: "number",
        description: "Number of overlapping words between chunks",
        default: 10
      }
    }
  }
};

const CLIENT_QUERY_TOOL: Tool = {
  name: NilRAGTools.CLIENT_QUERY,
  description: 
    "Query nilDB with NilAI using nilRAG for a specific prompt/query.\n" +
    "This tool searches through your private data repository using advanced embedding techniques.\n" +
    "Results are used to contextualize responses and provide highly relevant information.\n" +
    "The query is processed securely against your encrypted data collection.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Query prompt"
      },
      model: {
        type: "string",
        description: "Model to use",
        default: "meta-llama/Llama-3.1-8B-Instruct"
      },
      temperature: {
        type: "number",
        description: "Temperature for completion",
        default: 0.2
      },
      max_tokens: {
        type: "number", 
        description: "Maximum tokens to generate",
        default: 2048
      }
    },
    required: ["prompt"]
  }
};

// Server implementation
const server = new Server(
  {
    name: "mcp-nilrag-ts",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Type guards for the arguments
function isInitializeArgs(args: unknown): args is Record<string, never> {
  return typeof args === "object" && args !== null;
}

function isUploadOwnerDataArgs(args: unknown): args is { 
  file_path?: string; 
  file_content?: string; 
  chunk_size?: number; 
  overlap?: number 
} {
  return (
    typeof args === "object" &&
    args !== null &&
    (
      ("file_path" in args && typeof (args as any).file_path === "string") ||
      ("file_content" in args && typeof (args as any).file_content === "string")
    )
  );
}

function isClientQueryArgs(args: unknown): args is { 
  prompt: string; 
  model?: string; 
  temperature?: number; 
  max_tokens?: number 
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "prompt" in args &&
    typeof (args as any).prompt === "string"
  );
}

/**
 * Execute a Python function from the nilRAG server
 * @param functionName The name of the Python function to execute
 * @param args Arguments to pass to the function
 * @returns Promise with the result of the function
 */
async function executePythonFunction(functionName: string, args: any): Promise<any> {
  try {
    // Find the path to the bridge script
    let bridgeScriptPath = BRIDGE_SCRIPT_PATH;
    if (!fs.existsSync(bridgeScriptPath)) {
      // If we're in the compiled directory, adjust the path
      bridgeScriptPath = './nilrag_bridge.py';
      if (!fs.existsSync(bridgeScriptPath)) {
        throw new Error(`Bridge script not found at ${BRIDGE_SCRIPT_PATH} or ${bridgeScriptPath}`);
      }
    }

    // Make sure the script is executable
    await promisify(fs.chmod)(bridgeScriptPath, '755');
    
    // Generate a temporary file to store the arguments as JSON
    const tempFile = path.join(os.tmpdir(), `nilrag-args-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(args));
    
    // Prepare the command with or without virtual environment activation
    let pythonCmd = '';
    if (PYTHON_VENV_PATH) {
      pythonCmd = `source ${PYTHON_VENV_PATH}/bin/activate && python`;
    } else {
      pythonCmd = 'python';
    }
    
    // Command to run the Python bridge script with file-based arguments
    // The @ prefix tells the bridge script to read arguments from a file
    const command = `cd ${PYTHON_SERVER_PATH} && ${pythonCmd} ${bridgeScriptPath} ${functionName} @${tempFile}`;
    
    // Execute the command
    const { stdout, stderr } = await promisify(exec)(command);
    
    // Clean up the temporary file
    fs.unlinkSync(tempFile);
    
    if (stderr) {
      console.error(`stderr: ${stderr}`);
    }

    // Parse the output as JSON
    try {
      const output = JSON.parse(stdout);
      if (output.error) {
        throw new Error(`Python function error: ${output.error}`);
      }
      return output.result;
    } catch (e) {
      throw new Error(`Failed to parse Python output: ${stdout}`);
    }
  } catch (error: any) { // Explicit any type to fix the linter error
    console.error(`Error executing Python function: ${error}`);
    throw new Error(`Failed to execute Python function: ${error.message}`);
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [INITIALIZE_TOOL, UPLOAD_OWNER_DATA_TOOL, CLIENT_QUERY_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case NilRAGTools.INITIALIZE: {
        if (!isInitializeArgs(args)) {
          throw new Error("Invalid arguments for initialize");
        }
        const result = await executePythonFunction('initialize', {});
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }

      case NilRAGTools.UPLOAD_OWNER_DATA: {
        if (!isUploadOwnerDataArgs(args)) {
          throw new Error("Invalid arguments for upload_owner_data");
        }
        const { file_path, file_content, chunk_size = 50, overlap = 10 } = args;
        const result = await executePythonFunction('upload_owner_data', {
          file_path,
          file_content,
          chunk_size,
          overlap
        });
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }

      case NilRAGTools.CLIENT_QUERY: {
        if (!isClientQueryArgs(args)) {
          throw new Error("Invalid arguments for client_query");
        }
        const { prompt, model = "meta-llama/Llama-3.1-8B-Instruct", temperature = 0.2, max_tokens = 2048 } = args;
        const result = await executePythonFunction('client_query', {
          prompt,
          model,
          temperature,
          max_tokens
        });
        return {
          content: [{ type: "text", text: result }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("nilRAG TypeScript MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
}); 