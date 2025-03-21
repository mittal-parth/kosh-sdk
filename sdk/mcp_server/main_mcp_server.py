from mcp import Server
from typing import Dict, Any
import importlib.util
import os
from pathlib import Path

# Create MCP server
server = Server()

# Import all tool endpoints from the generated_tools directory
tools_dir = Path("generated_tools")
for tool_file in tools_dir.glob("*_tool.py"):
    spec = importlib.util.spec_from_file_location(tool_file.stem, tool_file)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

if __name__ == "__main__":
    server.run()
