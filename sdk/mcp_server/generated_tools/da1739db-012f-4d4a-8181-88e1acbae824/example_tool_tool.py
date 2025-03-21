import httpx
from mcp import tool

@tool()
async def example_tool(input_str: str) -> str:
    """
Process the input string and return a result.
    
    Args:
        input_str: Input string to process
    
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "http://placeholder_server/example",
                params={"input": input_str}
            )
            response.raise_for_status()
            return response.json()["result"]
    except Exception as e:
        return f"Error: {str(e)}"
