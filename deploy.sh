#!/bin/bash
# deploy.sh
# Run this script on your VPS to update and rebuild LinguistFlow

echo "🚀 Starting LinguistFlow deployment..."

# Pull latest changes from git
echo "📦 Pulling latest code..."
git pull origin main

# Build and start Docker containers in detached mode
echo "🐳 Rebuilding and starting containers..."
docker-compose -f docker-compose.prod.yml up -d --build

# Remove unused/dangling images to free up space
echo "🧹 Cleaning up unused Docker images..."
docker image prune -f

echo "✅ Deployment complete!"
