from fastapi import FastAPI
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
