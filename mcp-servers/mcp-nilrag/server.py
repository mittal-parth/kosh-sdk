"""
MCP Server implementation for nilRAG.
"""

import asyncio
import json
import logging
import os
import shutil
from enum import Enum
from pathlib import Path
from typing import Optional

import nilql
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    TextContent,
    Tool,
)
from pydantic import BaseModel

from utils.config import load_nil_db_config
from utils.nildb_requests import ChatCompletionConfig, NilDB
from utils.util import (
    create_chunks,
    encrypt_float_list,
    generate_embeddings_huggingface,
    load_file,
)


# Define Pydantic models for input validation
class Initialize(BaseModel):
    """Model for initializing nilRAG schema and query."""

    pass  # No parameters needed


class UploadOwnerData(BaseModel):
    """Model for uploading data to nilDB."""

    file_path: Optional[str] = None
    file_content: Optional[str] = None
    chunk_size: int = 50
    overlap: int = 10


class ClientQuery(BaseModel):
    """Model for querying nilDB with NilAI."""

    prompt: str
    model: str = "meta-llama/Llama-3.1-8B-Instruct"
    temperature: float = 0.2
    max_tokens: int = 2048


# Define tool names as enum
class NilRAGTools(str, Enum):
    """Enum of available nilRAG tools."""

    INITIALIZE = "initialize"
    UPLOAD_OWNER_DATA = "upload_owner_data"
    CLIENT_QUERY = "client_query"


# NilRAG functions
class NilRAGManager:
    """Manager for nilRAG operations."""

    def __init__(self):
        """Initialize the nilRAG manager."""
        # Get configuration from environment variables or use defaults
        self.org_secret_key = os.environ.get(
            "NILRAG_ORG_SECRET_KEY", os.environ.get("NILRAG_SECRET_KEY")
        )
        self.org_did = os.environ.get("NILRAG_ORG_DID")
        self.nilai_api_url = os.environ.get(
            "NILAI_API_URL", "https://nilai-a779.nillion.network"
        )
        self.nilai_api_token = os.environ.get("NILAI_API_TOKEN", "Nillion2025")

        # Default config paths
        self.workspace_root = Path(__file__).parent
        self.sample_config_path = (
            self.workspace_root / "examples" / "nildb_config.sample.json"
        )
        self.config_path = self.workspace_root / "examples" / "nildb_config.json"

        # Override config path if specified in environment
        if os.environ.get("NILRAG_CONFIG_PATH"):
            self.config_path = Path(os.environ.get("NILRAG_CONFIG_PATH"))

        self.nil_db: Optional[NilDB] = None
        self.additive_key = None
        self.xor_key = None
        self.is_initialized = False
        self.logger = logging.getLogger(__name__)

    def setup_config_file(self) -> str:
        """
        Create a configuration file from the sample if it doesn't exist,
        populating it with the organization's secret key and DID.

        Returns:
            str: Path to the configuration file
        """
        # If config file doesn't exist, create it from sample
        if not self.config_path.exists():
            self.logger.info(
                f"Config file not found at {self.config_path}, creating from sample"
            )

            # Ensure the directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            # If sample doesn't exist, raise an error
            if not self.sample_config_path.exists():
                raise FileNotFoundError(
                    f"Sample config file not found at {self.sample_config_path}"
                )

            # Copy the sample config
            shutil.copy2(self.sample_config_path, self.config_path)
            self.logger.info(f"Created config file from sample at {self.config_path}")

        # Update the config with org_secret_key and org_did if provided
        if self.org_secret_key or self.org_did:
            self.logger.info("Updating config with provided organization credentials")
            with open(self.config_path, "r", encoding="utf-8") as f:
                config_data = json.load(f)

            if self.org_secret_key:
                config_data["org_secret_key"] = self.org_secret_key

            if self.org_did:
                config_data["org_did"] = self.org_did

            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=4)

            self.logger.info(
                f"Updated config at {self.config_path} with organization credentials"
            )

        return str(self.config_path)

    async def initialize(self) -> str:
        """
        Initialize nilRAG schema and query.

        Returns:
            str: Status message
        """
        if self.is_initialized:
            return "Schema and query already initialized"

        # Setup config file before loading
        try:
            self.setup_config_file()

            # Load NilDB configuration
            self.nil_db, secret_key = load_nil_db_config(
                str(self.config_path), require_secret_key=True
            )

            # Generate JWT tokens
            jwts = self.nil_db.generate_jwt(secret_key, ttl=3600)

            # Initialize secret keys for different modes of operation
            num_nodes = len(self.nil_db.nodes)
            self.additive_key = nilql.ClusterKey.generate(
                {"nodes": [{}] * num_nodes}, {"sum": True}
            )
            self.xor_key = nilql.ClusterKey.generate(
                {"nodes": [{}] * num_nodes}, {"store": True}
            )

            # Initialize schema
            schema_id = await self.nil_db.init_schema()
            self.logger.info(f"Schema initialized with ID: {schema_id}")

            # Initialize query
            diff_query_id = await self.nil_db.init_diff_query()
            self.logger.info(f"Query initialized with ID: {diff_query_id}")

            # Update config file with new IDs and tokens
            with open(self.config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for node_data, jwt in zip(data["nodes"], jwts):
                node_data["schema_id"] = schema_id
                node_data["diff_query_id"] = diff_query_id
                node_data["bearer_token"] = jwt
            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)

            self.is_initialized = True
            self.logger.info(
                "Updated nilDB configuration file with schema and query IDs"
            )
            return "Schema and query initialized successfully"
        except Exception as e:
            self.logger.error(f"Initialization error: {str(e)}")
            return f"Error initializing nilRAG: {str(e)}"

    async def upload_owner_data(
        self,
        file_path: Optional[str],
        file_content: Optional[str],
        chunk_size: int,
        overlap: int,
    ) -> str:
        """
        Upload data to nilDB using nilRAG.

        Args:
            file_path: Path to data file to upload
            file_content: Direct content to upload
            chunk_size: Maximum number of words per chunk
            overlap: Number of overlapping words between chunks

        Returns:
            str: Status message
        """
        if not self.is_initialized:
            await self.initialize()

        if not file_path and not file_content:
            return "Error: Either file_path or file_content must be provided"

        try:
            # Get paragraphs either from file or direct content
            if file_content:
                paragraphs = file_content.split("\n\n")
                paragraphs = [para.strip() for para in paragraphs if para.strip()]
                source_type = "direct content"
            else:
                paragraphs = load_file(file_path)
                source_type = f"file: {file_path}"

            # Generate embeddings and chunks
            chunks = create_chunks(paragraphs, chunk_size=chunk_size, overlap=overlap)
            self.logger.info("Chunks created")

            embeddings = generate_embeddings_huggingface(chunks)
            self.logger.info("Embeddings generated")

            # Encrypt chunks and embeddings
            chunks_shares = [nilql.encrypt(self.xor_key, chunk) for chunk in chunks]
            embeddings_shares = [
                encrypt_float_list(self.additive_key, embedding)
                for embedding in embeddings
            ]
            self.logger.info("Data encrypted")
            
            # Upload encrypted data to nilDB
            self.nil_db, _ = load_nil_db_config(
                str(self.config_path),
                require_bearer_token=True,
                require_schema_id=True,
            )
            await self.nil_db.upload_data(embeddings_shares, chunks_shares)
            self.logger.info("Data uploaded to nilDB")

            return f"Successfully uploaded {len(chunks)} chunks from {source_type}"
        except Exception as e:
            self.logger.error(f"Upload error: {str(e)}")
            return f"Error uploading data: {str(e)}"

    async def client_query(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        """
        Query nilDB with NilAI using nilRAG.

        Args:
            prompt: Query prompt
            model: Model to use
            temperature: Temperature for completion
            max_tokens: Maximum tokens to generate

        Returns:
            str: Query response
        """
        if not self.is_initialized:
            await self.initialize()

        try:
            config = ChatCompletionConfig(
                nilai_url=self.nilai_api_url,
                token=self.nilai_api_token,
                messages=[{"role": "user", "content": prompt}],
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            self.nil_db, _ = load_nil_db_config(
                str(self.config_path),
                require_bearer_token=True,
                require_schema_id=True,
                require_diff_query_id=True,
            )
            
            response = self.nil_db.nilai_chat_completion(config)
            self.logger.info(f"Query completed with response: {response}")
            
            # Extract the response content
            if "choices" in response and len(response["choices"]) > 0:
                choice = response["choices"][0]
                if "message" in choice and "content" in choice["message"]:
                    # Return just the content for a cleaner response
                    return choice["message"]["content"]

            # If we can't extract the content, return the full response as JSON
            return json.dumps(response, indent=2)
        except Exception as e:
            self.logger.error(f"Query error: {str(e)}")
            return f"Error querying nilDB: {str(e)}"


async def serve() -> None:
    """Run the nilRAG MCP server."""
    logger = logging.getLogger(__name__)
    logger.info("Starting nilRAG MCP server")

    # Create server and manager
    server = Server("mcp-nilrag")
    manager = NilRAGManager()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools."""
        return [
            Tool(
                name=NilRAGTools.INITIALIZE,
                description="Initialize nilRAG schema and query",
                inputSchema=Initialize.model_json_schema(),
            ),
            Tool(
                name=NilRAGTools.UPLOAD_OWNER_DATA,
                description="Upload data to nilDB",
                inputSchema=UploadOwnerData.model_json_schema(),
            ),
            Tool(
                name=NilRAGTools.CLIENT_QUERY,
                description="Query nilDB with NilAI using nilRAG for a specific prompt/query",
                inputSchema=ClientQuery.model_json_schema(),
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        """Call a nilRAG tool."""
        try:
            match name:
                case NilRAGTools.INITIALIZE:
                    result = await manager.initialize()
                    return [TextContent(type="text", text=result)]

                case NilRAGTools.UPLOAD_OWNER_DATA:
                    result = await manager.upload_owner_data(
                        file_path=arguments.get("file_path"),
                        file_content=arguments.get("file_content"),
                        chunk_size=arguments.get("chunk_size", 50),
                        overlap=arguments.get("overlap", 10),
                    )
                    return [TextContent(type="text", text=result)]

                case NilRAGTools.CLIENT_QUERY:
                    result = await manager.client_query(
                        prompt=arguments["prompt"],
                        model=arguments.get(
                            "model", "meta-llama/Llama-3.1-8B-Instruct"
                        ),
                        temperature=arguments.get("temperature", 0.2),
                        max_tokens=arguments.get("max_tokens", 2048),
                    )
                    return [TextContent(type="text", text=result)]

                case _:
                    return [TextContent(type="text", text=f"Unknown tool: {name}")]
        except Exception as e:
            logger.error(f"Error calling tool {name}: {str(e)}")
            return [TextContent(type="text", text=f"Error: {str(e)}")]

    # Run the server
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    asyncio.run(serve())
