FROM node:25

WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/

# Set the command to run the application
CMD ["node", "src/index.js", "/config.json"]
