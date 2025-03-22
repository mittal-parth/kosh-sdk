FROM --platform=linux/amd64 node:20-slim

WORKDIR /app

# Install necessary system dependencies
RUN apt-get update && apt-get install -y \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

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

# Command to run the development server with host configuration to allow external access
CMD ["npm", "run", "dev", "--host", "0.0.0.0"]