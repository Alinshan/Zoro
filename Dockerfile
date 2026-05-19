FROM node:22-slim

# Install core system dependencies (ffmpeg, webp, git) required for media downloads and sticker generation
RUN apt-get update && apt-get install -y \
    ffmpeg \
    webp \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create application workspace
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package*.json ./

# Install npm dependencies (production optimization)
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Expose the Zoro onboarding web dashboard port
EXPOSE 8000

# Run the Zoro Unified Launcher
CMD ["node", "start.js"]
