# Use ARM64 architecture for Linux
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only package files first
COPY package.json pnpm-lock.yaml ./

# Install dependencies for Linux ARM64
RUN pnpm install

# Copy remaining application files (excluding node_modules)
COPY src/ ./src/
COPY public/ ./public/
COPY *.json *.js *.ts *.html ./
COPY .gitignore ./

# Expose the Vite dev server port
EXPOSE 5173

# Command to run the development server
CMD ["npm", "run", "dev"] 