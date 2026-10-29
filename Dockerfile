FROM node:26-bookworm-slim

WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --ignore-scripts

# Copy source code
COPY src/ ./src/

# Set the command to run the application
CMD ["node", "src/index.js", "/config.json"]
