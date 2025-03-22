"""
FastAPI Server implementation for nilRAG.
"""

import json
import logging
import os
import shutil
import sys
from enum import Enum
from pathlib import Path
from typing import Optional

import nilql
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

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
    
    nilrag_org_secret_key: Optional[str] = None
    nilrag_org_did: Optional[str] = None
    nilai_api_token: Optional[str] = None
    nilai_api_url: Optional[str] = None


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


class ResponseModel(BaseModel):
    """Model for API responses."""
    status: str
    message: Optional[str] = None
    content: Optional[str] = None
    chunks_count: Optional[int] = None
    source: Optional[str] = None
    model: Optional[str] = None
    response: Optional[dict] = None


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
            # Ensure the directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            # If sample doesn't exist, raise an error
            if not self.sample_config_path.exists():
                raise FileNotFoundError(
                    f"Sample config file not found at {self.sample_config_path}"
                )

            # Copy the sample config
            shutil.copy2(self.sample_config_path, self.config_path)

        # Update the config with org_secret_key and org_did if provided
        if self.org_secret_key or self.org_did:
            with open(self.config_path, "r", encoding="utf-8") as f:
                config_data = json.load(f)

            if self.org_secret_key:
                config_data["org_secret_key"] = self.org_secret_key

            if self.org_did:
                config_data["org_did"] = self.org_did

            with open(self.config_path, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=4)

        return str(self.config_path)

    async def initialize(self) -> dict:
        """
        Initialize nilRAG schema and query.

        Returns:
            dict: Status message
        """
        if self.is_initialized:
            return {"status": "success", "message": "Schema and query already initialized"}

        # Setup config file before loading
        try:
            # Temporarily redirect stdout to suppress any print statements
            original_stdout = sys.stdout
            sys.stdout = open(os.devnull, 'w')
            
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

            # Initialize query
            diff_query_id = await self.nil_db.init_diff_query()

            # Restore stdout
            sys.stdout.close()
            sys.stdout = original_stdout

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
            return {"status": "success", "message": "Schema and query initialized successfully"}
        except Exception as e:
            # Restore stdout in case of exception
            if 'original_stdout' in locals():
                try:
                    sys.stdout.close()
                except:
                    pass
                sys.stdout = original_stdout
                
            return {"status": "error", "message": f"Error initializing nilRAG: {str(e)}"}

    async def upload_owner_data(
        self,
        file_path: Optional[str],
        file_content: Optional[str],
        chunk_size: int,
        overlap: int,
    ) -> dict:
        """
        Upload data to nilDB using nilRAG.

        Args:
            file_path: Path to data file to upload
            file_content: Direct content to upload
            chunk_size: Maximum number of words per chunk
            overlap: Number of overlapping words between chunks

        Returns:
            dict: Status message
        """
        if not self.is_initialized:
            await self.initialize()

        if not file_path and not file_content:
            return {"status": "error", "message": "Error: Either file_path or file_content must be provided"}

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

            embeddings = generate_embeddings_huggingface(chunks)

            # Encrypt chunks and embeddings
            chunks_shares = [nilql.encrypt(self.xor_key, chunk) for chunk in chunks]
            embeddings_shares = [
                encrypt_float_list(self.additive_key, embedding)
                for embedding in embeddings
            ]
            
            # Upload encrypted data to nilDB
            self.nil_db, _ = load_nil_db_config(
                str(self.config_path),
                require_bearer_token=True,
                require_schema_id=True,
            )
            await self.nil_db.upload_data(embeddings_shares, chunks_shares)

            return {
                "status": "success", 
                "message": f"Successfully uploaded {len(chunks)} chunks from {source_type}",
                "chunks_count": len(chunks),
                "source": source_type
            }
        except Exception as e:
            return {"status": "error", "message": f"Error uploading data: {str(e)}"}

    async def client_query(
        self,
        prompt: str,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> dict:
        """
        Query nilDB with NilAI using nilRAG.

        Args:
            prompt: Query prompt
            model: Model to use
            temperature: Temperature for completion
            max_tokens: Maximum tokens to generate

        Returns:
            dict: Query response
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
            
            # Extract the response content
            if "choices" in response and len(response["choices"]) > 0:
                choice = response["choices"][0]
                if "message" in choice and "content" in choice["message"]:
                    # Return the content in structured format
                    return {
                        "status": "success",
                        "content": choice["message"]["content"],
                        "model": model
                    }

            # If we can't extract the content, return the full response
            return {
                "status": "success",
                "response": response
            }
        except Exception as e:
            return {"status": "error", "message": f"Error querying nilDB: {str(e)}"}


# Create FastAPI app
app = FastAPI(
    title="NilRAG API",
    description="API for nilRAG operations using FastAPI",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Can be set to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create manager instance
manager = NilRAGManager()

@app.post("/initialize", response_model=ResponseModel)
async def initialize_endpoint(init_data: Initialize = Initialize()):
    """Initialize nilRAG schema and query."""
    # Update environment variables with provided values
    if init_data.nilrag_org_secret_key:
        os.environ["NILRAG_ORG_SECRET_KEY"] = init_data.nilrag_org_secret_key
    if init_data.nilrag_org_did:
        os.environ["NILRAG_ORG_DID"] = init_data.nilrag_org_did
    if init_data.nilai_api_token:
        os.environ["NILAI_API_TOKEN"] = init_data.nilai_api_token
    if init_data.nilai_api_url:
        os.environ["NILAI_API_URL"] = init_data.nilai_api_url
        
    # Create a new manager with the updated environment variables
    global manager
    manager = NilRAGManager()
    
    result = await manager.initialize()
    return result

@app.post("/upload", response_model=ResponseModel)
async def upload_endpoint(data: UploadOwnerData):
    """Upload data to nilDB."""
    result = await manager.upload_owner_data(
        file_path=data.file_path,
        file_content=data.file_content,
        chunk_size=data.chunk_size,
        overlap=data.overlap,
    )
    return result

@app.post("/query", response_model=ResponseModel)
async def query_endpoint(query: ClientQuery):
    """Query nilDB with NilAI."""
    result = await manager.client_query(
        prompt=query.prompt,
        model=query.model,
        temperature=query.temperature,
        max_tokens=query.max_tokens,
    )
    return result

if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    
    # Run the FastAPI app
    uvicorn.run(app, host="0.0.0.0", port=8000)
