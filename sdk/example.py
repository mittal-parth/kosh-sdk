from tool_splitter import KoshTool, deploy_tool

# Create the tool instance with a unique endpoint
tool = KoshTool("/example", "Example tool that processes input")

@tool
def example_tool(input_str: str) -> str:
    """Process the input string and return a result.
    
    Args:
        input_str: Input string to process
    """
    # Process the input
    result = input_str.upper()
    
    # Return the result
    return result

# Deploy the tool to generate both server and tool files
deploy_tool(tool) 