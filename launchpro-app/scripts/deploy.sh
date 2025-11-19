#!/bin/bash

# LaunchPro Deployment Script for Google Cloud Run
# This script automates the deployment process

set -e

echo "🚀 LaunchPro Deployment Script"
echo "================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No GCP project set"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📦 Project ID: $PROJECT_ID"

# Set variables
REGION="us-central1"
SERVICE_NAME="launchpro"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Build the Docker image
echo ""
echo "🔨 Building Docker image..."
docker build -t $IMAGE_NAME:latest .

# Push to Google Container Registry
echo ""
echo "📤 Pushing image to GCR..."
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
echo ""
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0 \
  --concurrency 80 \
  --set-env-vars NODE_ENV=production

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo "✅ Deployment successful!"
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "📊 To view logs:"
echo "   gcloud run services logs read $SERVICE_NAME --region $REGION"
echo ""
echo "⚙️  To update environment variables:"
echo "   gcloud run services update $SERVICE_NAME --region $REGION --update-env-vars KEY=VALUE"
echo ""
