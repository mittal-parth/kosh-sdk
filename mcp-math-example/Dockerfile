FROM --platform=linux/amd64 node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Copy the pre-built node_modules directory
COPY node_modules/ ./node_modules/

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY *.json *.js *.ts *.html ./
COPY .gitignore ./

# Expose the Vite dev server port
EXPOSE 5173

# Command to run the development server
CMD ["npm", "run", "dev", "--host", "0.0.0.0"]