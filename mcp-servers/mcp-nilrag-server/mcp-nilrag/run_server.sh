#!/bin/bash

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Print debug information
echo "Script directory: $SCRIPT_DIR" >&2
echo "Current directory: $(pwd)" >&2

# Define project root (mcp-nilrag directory itself)
PROJECT_ROOT="$SCRIPT_DIR"

echo "Project root: $PROJECT_ROOT" >&2

# Activate the virtual environment
# Get the absolute path of the virtual environment
if [ -d "$PROJECT_ROOT/venv" ]; then
    VENV_DIR="$PROJECT_ROOT/venv"
    echo "Using venv at: $VENV_DIR" >&2
    source "$VENV_DIR/bin/activate"
elif [ -d "$PROJECT_ROOT/.venv" ]; then
    VENV_DIR="$PROJECT_ROOT/.venv"
    echo "Using .venv at: $VENV_DIR" >&2
    source "$VENV_DIR/bin/activate"
else
    echo "No virtual environment found at venv or .venv. Using system Python." >&2
fi

# Print Python information
which python >&2
python --version >&2
echo "PYTHONPATH: $PYTHONPATH" >&2

# Verify the server file exists
if [ ! -f "$SCRIPT_DIR/server.py" ]; then
    echo "ERROR: Server file not found at $SCRIPT_DIR/server.py" >&2
    exit 1
fi

# Run the server with provided arguments
echo "Running: python $SCRIPT_DIR/server.py \"$@\"" >&2
python "$SCRIPT_DIR/server.py" "$@" 