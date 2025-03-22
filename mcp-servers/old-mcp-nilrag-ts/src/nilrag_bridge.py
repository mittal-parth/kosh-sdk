#!/usr/bin/env python
"""
Bridge script to connect TypeScript MCP server with nilRAG Python functions.
This script is called by the TypeScript server to execute nilRAG functions.
"""

import json
import sys
import asyncio
import os
import logging
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("nilrag_bridge")

# Add parent directory to path so we can import from the nilRAG module
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.abspath(os.path.join(current_dir, "../.."))
nilrag_dir = os.path.join(parent_dir, "mcp-nilrag")
sys.path.append(nilrag_dir)
# logger.info(f"Added {nilrag_dir} to Python path")

async def main():
    """Parse arguments and call the appropriate nilRAG function."""
    # Validate input arguments
    if len(sys.argv) != 3:
        error_msg = "Invalid arguments. Usage: nilrag_bridge.py <function_name> <json_args_or_file>"
        # logger.error(error_msg)
        print(json.dumps({"error": error_msg}))
        sys.exit(1)
    
    function_name = sys.argv[1]
    args_input = sys.argv[2]
    
    # logger.info(f"Executing function: {function_name}")
    
    try:
        # Check if the args input is a file path
        if args_input.startswith('@'):
            # Extract the file path from the argument (remove the @ prefix)
            file_path = args_input[1:]
            with open(file_path, 'r') as f:
                args = json.load(f)
        else:
            args = json.loads(args_input)
        # logger.debug(f"Arguments: {args}")
    except json.JSONDecodeError as e:
        error_msg = f"Invalid JSON arguments: {str(e)}"
        # logger.error(error_msg)
        print(json.dumps({"error": error_msg}))
        sys.exit(1)
    except FileNotFoundError:
        error_msg = f"Arguments file not found: {args_input[1:]}"
        # logger.error(error_msg)
        print(json.dumps({"error": error_msg}))
        sys.exit(1)
    
    # Create a string buffer to capture any print output
    f = StringIO()
    
    try:
        # Import here to ensure we're using the correct environment
        from server import NilRAGManager
        
        manager = NilRAGManager()
        # logger.info(f"NilRAGManager initialized")
        
        # Redirect stdout and stderr to our buffer to prevent print statements
        # from interfering with our JSON output
        with redirect_stdout(f), redirect_stderr(f):
            if function_name == 'initialize':
                # logger.info("Calling initialize()")
                result = await manager.initialize()
            elif function_name == 'upload_owner_data':
                # logger.info("Calling upload_owner_data()")
                result = await manager.upload_owner_data(
                    file_path=args.get('file_path'),
                    file_content=args.get('file_content'),
                    chunk_size=args.get('chunk_size', 50),
                    overlap=args.get('overlap', 10)
                )
            elif function_name == 'client_query':
                # logger.info("Calling client_query()")
                result = await manager.client_query(
                    prompt=args.get('prompt'),
                    model=args.get('model', 'meta-llama/Llama-3.1-8B-Instruct'),
                    temperature=args.get('temperature', 0.2),
                    max_tokens=args.get('max_tokens', 2048)
                )
            else:
                error_msg = f"Unknown function: {function_name}"
                # logger.error(error_msg)
                print(json.dumps({"error": error_msg}))
                sys.exit(1)
        
        # Return the result as JSON
        # logger.info(f"Function executed successfully")
        print(json.dumps({"result": result}))
    
    except Exception as e:
        # Return any errors as JSON
        # logger.exception(f"Error executing function {function_name}: {str(e)}")
        # Include any captured stdout in the error message for debugging
        captured_output = f.getvalue()
        print(json.dumps({
            "error": str(e),
            "stdout": captured_output if captured_output else None
        }))
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main()) 