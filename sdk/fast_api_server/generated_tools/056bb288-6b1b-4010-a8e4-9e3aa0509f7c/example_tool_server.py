from typing import Union
from fastapi import FastAPI

app = FastAPI()

@app.get("/example")
def example_tool(input: str):
    """
Process the input string and return a result.
    
    Args:
        input_str: Input string to process
    
    """
    # Process the input
    result = input.upper()
    
    # Return the result
    return {"result": result}
