import asyncio
from typing import Optional, Dict, Any, List
from contextlib import AsyncExitStack
import os
import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from anthropic import Anthropic
from openai import OpenAI
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()  # load environment variables from .env

class MCPClient:
    def __init__(self):
        # Initialize session and client objects
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        
        # Initialize model clients
        self.anthropic = Anthropic()
        
        # Initialize Gemini
        if os.getenv("GEMINI_API_KEY"):
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            self.gemini = genai
        else:
            self.gemini = None
            
        # Initialize OpenRouter (uses OpenAI SDK)
        if os.getenv("OPENROUTER_API_KEY"):
            self.openrouter = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=os.getenv("OPENROUTER_API_KEY")
            )
        else:
            self.openrouter = None
            
        # Default model settings
        self.current_model = os.getenv("DEFAULT_MODEL", "anthropic/claude-3-5-sonnet")
        
    async def connect_to_server(self, server_script_path: str):
        """Connect to an MCP server
        
        Args:
            server_script_path: Path to the server script (.py or .js)
        """
        is_python = server_script_path.endswith('.py')
        is_js = server_script_path.endswith('.js')
        if not (is_python or is_js):
            raise ValueError("Server script must be a .py or .js file")
            
        command = "python" if is_python else "node"
        server_params = StdioServerParameters(
            command=command,
            args=[server_script_path],
            env=None
        )
        
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        self.stdio, self.write = stdio_transport
        self.session = await self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write))
        
        await self.session.initialize()
        
        # List available tools
        response = await self.session.list_tools()
        tools = response.tools
        print("\nConnected to server with tools:", [tool.name for tool in tools])

    def set_model(self, model: str):
        """Set the current model to use"""
        self.current_model = model
        print(f"Model set to: {model}")
        
    def get_available_models(self) -> Dict[str, List[str]]:
        """Get list of available models organized by provider"""
        models = {
            "anthropic": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
            "gemini": [],
            "openrouter": []
        }
        
        if self.gemini:
            models["gemini"] = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
            
        if self.openrouter:
            models["openrouter"] = ["openai/gpt-4o", "anthropic/claude-3-opus"]
            
        return models

    async def process_query(self, query: str) -> str:
        """Process a query using the selected model and available tools"""
        response = await self.session.list_tools()
        available_tools = [{ 
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.inputSchema
        } for tool in response.tools]

        # Check which model provider to use
        if self.current_model.startswith("anthropic/") or self.current_model.startswith("claude"):
            return await self._process_with_anthropic(query, available_tools)
        elif self.current_model.startswith("gemini"):
            return await self._process_with_gemini(query, available_tools)
        elif self.current_model.startswith("openai/") or self.current_model.startswith("openrouter/"):
            return await self._process_with_openrouter(query, available_tools)
        else:
            return f"Unknown model provider for: {self.current_model}"

    async def _process_with_anthropic(self, query: str, available_tools) -> str:
        """Process a query using Anthropic Claude and available tools"""
        messages = [{"role": "user", "content": query}]
        model_name = self.current_model.replace("anthropic/", "")

        # Initial Claude API call
        response = self.anthropic.messages.create(
            model=model_name,
            max_tokens=1000,
            messages=messages,
            tools=available_tools
        )

        # Process response and handle tool calls
        tool_results = []
        final_text = []

        for content in response.content:
            if content.type == 'text':
                final_text.append(content.text)
            elif content.type == 'tool_use':
                tool_name = content.name
                tool_args = content.input
                
                # Execute tool call
                result = await self.session.call_tool(tool_name, tool_args)
                tool_results.append({"call": tool_name, "result": result})
                final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")

                # Continue conversation with tool results
                if hasattr(content, 'text') and content.text:
                    messages.append({
                      "role": "assistant",
                      "content": content.text
                    })
                messages.append({
                    "role": "user", 
                    "content": result.content
                })

                # Get next response from Claude
                response = self.anthropic.messages.create(
                    model=model_name,
                    max_tokens=1000,
                    messages=messages,
                )

                final_text.append(response.content[0].text)

        return "\n".join(final_text)
        
    async def _process_with_gemini(self, query: str, available_tools) -> str:
        """Process a query using Google's Gemini and available tools"""
        if not self.gemini:
            return "Gemini API key not configured. Please set GEMINI_API_KEY in your .env file."
            
        model_name = self.current_model.replace("gemini/", "")
        model = self.gemini.GenerativeModel(model_name)
        
        # Convert MCP tools to Gemini function format
        functions = []
        for tool in available_tools:
            functions.append({
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"]
            })
        
        # Start chat with Gemini
        chat = model.start_chat(tools=functions)
        
        response = await asyncio.to_thread(
            chat.send_message, 
            query
        )
        
        final_text = [response.text]
        
        # Handle function calls if present
        if hasattr(response, 'candidates') and response.candidates:
            for candidate in response.candidates:
                if hasattr(candidate, 'content') and candidate.content:
                    for part in candidate.content.parts:
                        if hasattr(part, 'function_call'):
                            func_call = part.function_call
                            tool_name = func_call.name
                            tool_args = json.loads(func_call.args)
                            
                            # Execute tool call
                            result = await self.session.call_tool(tool_name, tool_args)
                            final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")
                            
                            # Send result back to Gemini
                            response = await asyncio.to_thread(
                                chat.send_message, 
                                result.content
                            )
                            final_text.append(response.text)
        
        return "\n".join(final_text)
        
    async def _process_with_openrouter(self, query: str, available_tools) -> str:
        """Process a query using OpenRouter and available tools"""
        if not self.openrouter:
            return "OpenRouter API key not configured. Please set OPENROUTER_API_KEY in your .env file."
            
        # Convert MCP tools to OpenAI function format
        tools = []
        for tool in available_tools:
            tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": tool["input_schema"]
                }
            })
            
        messages = [{"role": "user", "content": query}]
        
        # Initial OpenRouter API call
        response = self.openrouter.chat.completions.create(
            model=self.current_model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=1000
        )
        
        # Process response and handle tool calls
        tool_results = []
        final_text = []
        
        if response.choices:
            message = response.choices[0].message
            final_text.append(message.content or "")
            
            if message.tool_calls:
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)
                    
                    # Execute tool call
                    result = await self.session.call_tool(tool_name, tool_args)
                    tool_results.append({"call": tool_name, "result": result})
                    final_text.append(f"[Calling tool {tool_name} with args {tool_args}]")
                    
                    # Continue conversation with tool results
                    messages.append({
                        "role": "assistant",
                        "content": message.content,
                        "tool_calls": [
                            {
                                "id": tool_call.id,
                                "function": {
                                    "name": tool_call.function.name,
                                    "arguments": tool_call.function.arguments
                                },
                                "type": "function"
                            }
                        ]
                    })
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result.content
                    })
                    
                    # Get next response from OpenRouter
                    response = self.openrouter.chat.completions.create(
                        model=self.current_model,
                        messages=messages,
                        max_tokens=1000
                    )
                    
                    if response.choices:
                        final_text.append(response.choices[0].message.content or "")
        
        return "\n".join(final_text)

    async def chat_loop(self):
        """Run an interactive chat loop"""
        print("\nMCP Client Started!")
        print("Type your queries or 'quit' to exit.")
        print("Type 'model list' to see available models.")
        print("Type 'model set <model_name>' to change models.")
        
        while True:
            try:
                query = input("\nQuery: ").strip()
                
                if query.lower() == 'quit':
                    break
                elif query.lower() == 'model list':
                    models = self.get_available_models()
                    print("\nAvailable models:")
                    for provider, provider_models in models.items():
                        print(f"- {provider}:")
                        for model in provider_models:
                            print(f"  • {model}")
                    print(f"\nCurrent model: {self.current_model}")
                elif query.lower().startswith('model set '):
                    model_name = query[10:].strip()
                    self.set_model(model_name)
                else:
                    response = await self.process_query(query)
                    print("\n" + response)
                    
            except Exception as e:
                print(f"\nError: {str(e)}")
    
    async def cleanup(self):
        """Clean up resources"""
        await self.exit_stack.aclose()

async def main():
    if len(sys.argv) < 2:
        print("Usage: python client.py <path_to_server_script>")
        sys.exit(1)
        
    client = MCPClient()
    try:
        await client.connect_to_server(sys.argv[1])
        await client.chat_loop()
    finally:
        await client.cleanup()

if __name__ == "__main__":
    import sys
    asyncio.run(main())