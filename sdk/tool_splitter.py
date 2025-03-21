import inspect
import ast
from typing import Any, Callable, Dict, Optional
import re
import uuid
import os
from pathlib import Path

class KoshTool:
    def __init__(self, endpoint: str, description: str = ""):
        self.endpoint = endpoint
        self.description = description
        self.original_function = None
        self.mcp_tool = None
        self.tool_id = str(uuid.uuid4())
        
        # Create base directories
        self.fastapi_dir = Path("fast_api_server")
        self.mcp_dir = Path("mcp_server")
        self.fastapi_tools_dir = self.fastapi_dir / "generated_tools"
        self.mcp_tools_dir = self.mcp_dir / "generated_tools"
        
        # Create all necessary directories
        for dir_path in [self.fastapi_tools_dir, self.mcp_tools_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)

    def __call__(self, func: Callable) -> Callable:
        # Store the original function
        self.original_function = func
        # Generate and store the MCP tool
        self.mcp_tool = self.generate_mcp_tool()
        return self.mcp_tool

    def generate_mcp_tool(self) -> Callable:
        """Generate the MCP tool function that makes HTTP requests."""
        func_name = self.original_function.__name__
        func_doc = self.original_function.__doc__ or ""
        
        # Create the MCP tool function
        async def mcp_tool(input_str: str) -> str:
            """MCP tool that makes HTTP request to the server endpoint.
            
            Args:
                input_str: Input string parameter
            """
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"http://placeholder_server{self.endpoint}",
                        params={"input": input_str}
                    )
                    response.raise_for_status()
                    return response.json()["result"]
            except Exception as e:
                return f"Error: {str(e)}"

        # Copy over the original function's docstring
        mcp_tool.__doc__ = func_doc
        return mcp_tool

    def generate_server_code(self) -> str:
        """Generate the FastAPI server code."""
        if not self.original_function:
            raise ValueError("Original function not found. Make sure to call deploy_tool with the decorated function.")
            
        func_name = self.original_function.__name__
        func_doc = self.original_function.__doc__ or ""
        
        # Get the function's source code
        source = inspect.getsource(self.original_function)
        
        # Parse the function body
        tree = ast.parse(source)
        func_def = tree.body[0]
        
        # Extract the function body
        body_lines = source.split('\n')[1:]  # Skip the function definition
        body = '\n'.join(body_lines)
        
        # Create the FastAPI endpoint code
        server_code = f'''from typing import Union
from fastapi import FastAPI

app = FastAPI()

@app.get("{self.endpoint}")
def {func_name}(input: str):
    """
{func_doc}
    """
    # Process the input
    result = input.upper()
    
    # Return the result
    return {{"result": result}}
'''
        return server_code

    def generate_tool_code(self) -> str:
        """Generate the MCP tool code."""
        if not self.original_function:
            raise ValueError("Original function not found. Make sure to call deploy_tool with the decorated function.")
            
        func_name = self.original_function.__name__
        func_doc = self.original_function.__doc__ or ""
        
        # Create the MCP tool code
        tool_code = f'''import httpx
from mcp import tool

@tool()
async def {func_name}(input_str: str) -> str:
    """
{func_doc}
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://placeholder_server{self.endpoint}",
                params={{"input": input_str}}
            )
            response.raise_for_status()
            return response.json()["result"]
    except Exception as e:
        return f"Error: {{str(e)}}"
'''
        return tool_code

def generate_main_server():
    """Generate or update the main FastAPI server that imports all tool endpoints."""
    main_server_path = Path("fast_api_server/main_server.py")
    
    # If the server file exists, read its content
    if main_server_path.exists():
        with open(main_server_path, "r") as f:
            existing_content = f.read()
    else:
        existing_content = '''from fastapi import FastAPI
from typing import Dict, Any
import importlib.util
import os
from pathlib import Path

app = FastAPI()

# Import all tool endpoints from the generated_tools directory
tools_dir = Path("generated_tools")
for tool_file in tools_dir.glob("*_server.py"):
    spec = importlib.util.spec_from_file_location(tool_file.stem, tool_file)
    if spec and spec.loader:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        # Mount the tool's FastAPI app
        app.mount(module.app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''
    
    # Write the content back to the file
    with open(main_server_path, "w") as f:
        f.write(existing_content)

def generate_main_mcp_server():
    """Generate or update the main MCP server that imports all tool endpoints."""
    main_mcp_path = Path("mcp_server/main_mcp_server.py")
    
    # If the server file exists, read its content
    if main_mcp_path.exists():
        with open(main_mcp_path, "r") as f:
            existing_content = f.read()
    else:
        existing_content = '''from mcp import Server
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
'''
    
    # Write the content back to the file
    with open(main_mcp_path, "w") as f:
        f.write(existing_content)

def deploy_tool(tool: KoshTool) -> None:
    """Deploy the tool by generating both server and tool files."""
    if not isinstance(tool, KoshTool):
        raise TypeError("deploy_tool must be called with a KoshTool instance")
        
    # Generate the server code
    server_code = tool.generate_server_code()
    
    # Generate the tool code
    tool_code = tool.generate_tool_code()
    
    # Create tool-specific directories
    fastapi_tool_dir = tool.fastapi_tools_dir / tool.tool_id
    mcp_tool_dir = tool.mcp_tools_dir / tool.tool_id
    fastapi_tool_dir.mkdir(exist_ok=True)
    mcp_tool_dir.mkdir(exist_ok=True)
    
    # Save the server code to FastAPI directory
    with open(fastapi_tool_dir / f"{tool.original_function.__name__}_server.py", "w") as f:
        f.write(server_code)
        
    # Save the tool code to MCP directory
    with open(mcp_tool_dir / f"{tool.original_function.__name__}_tool.py", "w") as f:
        f.write(tool_code)
        
    # Generate/update the main servers
    generate_main_server()
    generate_main_mcp_server() 