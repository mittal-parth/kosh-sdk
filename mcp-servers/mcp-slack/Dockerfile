FROM --platform=linux/amd64 node:20-slim

WORKDIR /app

# Install necessary system dependencies
RUN apt-get update && apt-get install -y \
    make \
    g++ \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install ngrok
RUN wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz && \
    tar -xvf ngrok-v3-stable-linux-amd64.tgz && \
    mv ngrok /usr/local/bin && \
    rm ngrok-v3-stable-linux-amd64.tgz

# Copy package files first for better caching
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Set environment variables to debug workerd
# ENV NODE_DEBUG=worker
# ENV DEBUG=*

# Expose the Vite dev server port
EXPOSE 5173

# Set up entrypoint command to run both the dev server and ngrok
ENTRYPOINT ["/bin/bash", "-c", "npm run dev --host 0.0.0.0 & sleep 5 && ngrok config add-authtoken 2ugDqNABZVd7wTIxcZ0lgbYa0Ru_6we24FwNijmvx5bPRSpEx && ngrok http 5176"]