#!/bin/bash

# Debug information
echo "Current directory: $(pwd)"
echo "Script location: $0"

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Script directory: $SCRIPT_DIR"

# Change to the script directory
cd "$SCRIPT_DIR"

# Path to Python server
PYTHON_SERVER_PATH="$SCRIPT_DIR/../mcp-nilrag"

# Check for virtual environment (either venv or .venv)
PYTHON_VENV_PATH=""
if [ -d "$PYTHON_SERVER_PATH/venv" ]; then
    PYTHON_VENV_PATH="$PYTHON_SERVER_PATH/venv"
    echo "Found Python virtual environment at: $PYTHON_VENV_PATH" >&2
elif [ -d "$PYTHON_SERVER_PATH/.venv" ]; then
    PYTHON_VENV_PATH="$PYTHON_SERVER_PATH/.venv"
    echo "Found Python virtual environment at: $PYTHON_VENV_PATH" >&2
else
    echo "WARNING: No Python virtual environment found at venv or .venv" >&2
    echo "The TypeScript server might not work correctly without the proper Python environment" >&2
    echo "Continuing with system Python..." >&2
fi

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Always rebuild the TypeScript code to ensure we're using the latest changes
echo "Building TypeScript code..."
npm run build

# Copy and make the bridge script executable
echo "Copying and making the bridge script executable..."
cp src/nilrag_bridge.py dist/
chmod +x dist/nilrag_bridge.py

# Display Python environment info
if [ -n "$PYTHON_VENV_PATH" ]; then
    echo "Activating Python virtual environment..." >&2
    source "$PYTHON_VENV_PATH/bin/activate"
    which python >&2
    python --version >&2
else
    echo "Using system Python:" >&2
    which python >&2
    python --version >&2
fi

# Run the server with any provided arguments
echo "Running the server..."
node dist/index.js "$@" 