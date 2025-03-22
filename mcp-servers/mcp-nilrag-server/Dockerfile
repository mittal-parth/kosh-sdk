# Use a base image with Python 3.11 and Node.js
FROM ubuntu:22.04 AS base

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    gnupg \
    python3.11 \
    python3.11-dev \
    python3.11-venv \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm pnpm

# Set working directory
WORKDIR /app

# Copy both projects
COPY ./mcp-nilrag /app/mcp-nilrag
COPY ./mcp-nilrag-remote /app/mcp-nilrag-remote

# Install Python dependencies
WORKDIR /app/mcp-nilrag
RUN pip install -U pip setuptools wheel
RUN pip install uv
RUN uv venv /app/mcp-nilrag/.venv
ENV VIRTUAL_ENV=/app/mcp-nilrag/.venv
ENV PATH="/app/mcp-nilrag/.venv/bin:$PATH"
RUN uv sync

# Install TypeScript dependencies
WORKDIR /app/mcp-nilrag-remote
RUN pnpm install

# Create a script to run both services
WORKDIR /app
RUN echo '#!/bin/bash\n\
    cd /app/mcp-nilrag && . .venv/bin/activate && python -m uvicorn server_fastapi:app --host 0.0.0.0 --port 8000 & \n\
    cd /app/mcp-nilrag-remote && pnpm dev --host 0.0.0.0 & \n\
    wait\n\
    ' > /app/start-services.sh

RUN chmod +x /app/start-services.sh

# Expose ports (FastAPI on 8000, TypeScript on 3000 or whatever port it uses)
EXPOSE 5173

# Set environment variables
ENV NILRAG_ORG_SECRET_KEY="b74b05573bd2f0ab32384b798b1897f99364ec7e5a1cfd75e43f5dadd6ea8938"
ENV NILRAG_ORG_DID="did:nil:testnet:nillion16rg02vlv0d0ch8ynv4v7n5kuca09hrxwtzy9cv"
ENV NILAI_API_TOKEN="Nillion2025"
ENV NILAI_API_URL="https://nilai-a779.nillion.network"
ENV NILRAG_API_URL="http://localhost:8000"

# Run both services
CMD ["/app/start-services.sh"] 