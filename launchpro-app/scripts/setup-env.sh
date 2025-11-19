#!/bin/bash

# LaunchPro Environment Setup Script
# Creates .env file from .env.example with user input

set -e

echo "🔧 LaunchPro Environment Setup"
echo "================================"
echo ""

if [ -f .env ]; then
    read -p "⚠️  .env file already exists. Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

echo "This script will help you create your .env file."
echo "Press Enter to skip optional fields."
echo ""

# Database
echo "📊 DATABASE CONFIGURATION"
read -p "Database URL [postgresql://user:password@localhost:5432/launchpro]: " DATABASE_URL
DATABASE_URL=${DATABASE_URL:-"postgresql://user:password@localhost:5432/launchpro"}

# Tonic
echo ""
echo "🎯 TONIC API CONFIGURATION"
read -p "Tonic API Username: " TONIC_USERNAME
read -sp "Tonic API Password: " TONIC_PASSWORD
echo ""

# Meta
echo ""
echo "📘 META ADS CONFIGURATION"
read -p "Meta Access Token: " META_TOKEN
read -p "Meta Ad Account ID: " META_ACCOUNT_ID
read -p "Meta Pixel ID (optional): " META_PIXEL_ID

# TikTok
echo ""
echo "🎵 TIKTOK ADS CONFIGURATION"
read -p "TikTok Access Token: " TIKTOK_TOKEN
read -p "TikTok Advertiser ID: " TIKTOK_ADVERTISER_ID
read -p "TikTok Pixel ID (optional): " TIKTOK_PIXEL_ID

# Anthropic
echo ""
echo "🤖 ANTHROPIC API CONFIGURATION"
read -p "Anthropic API Key: " ANTHROPIC_KEY

# Google Cloud
echo ""
echo "☁️  GOOGLE CLOUD CONFIGURATION"
read -p "GCP Project ID: " GCP_PROJECT_ID
read -p "GCP Storage Bucket: " GCP_BUCKET
read -p "GCP Service Account JSON path [./gcp-service-account.json]: " GCP_CREDENTIALS
GCP_CREDENTIALS=${GCP_CREDENTIALS:-"./gcp-service-account.json"}

# Write .env file
cat > .env << EOF
# Database
DATABASE_URL="$DATABASE_URL"

# Tonic API
TONIC_API_USERNAME=$TONIC_USERNAME
TONIC_API_PASSWORD=$TONIC_PASSWORD
TONIC_API_BASE_URL=https://api.publisher.tonic.com

# Meta Ads API
META_ACCESS_TOKEN=$META_TOKEN
META_AD_ACCOUNT_ID=$META_ACCOUNT_ID
META_PIXEL_ID=$META_PIXEL_ID
META_API_VERSION=v21.0

# TikTok Ads API
TIKTOK_ACCESS_TOKEN=$TIKTOK_TOKEN
TIKTOK_ADVERTISER_ID=$TIKTOK_ADVERTISER_ID
TIKTOK_PIXEL_ID=$TIKTOK_PIXEL_ID

# Anthropic API
ANTHROPIC_API_KEY=$ANTHROPIC_KEY

# Google Cloud Platform
GCP_PROJECT_ID=$GCP_PROJECT_ID
GCP_LOCATION=us-central1
GCP_STORAGE_BUCKET=$GCP_BUCKET
GOOGLE_APPLICATION_CREDENTIALS=$GCP_CREDENTIALS

# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AI Features
ENABLE_AI_CONTENT_GENERATION=true
ENABLE_IMAGE_GENERATION=true
ENABLE_VIDEO_GENERATION=true
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "📝 Next steps:"
echo "   1. Review your .env file"
echo "   2. Place your GCP service account JSON at: $GCP_CREDENTIALS"
echo "   3. Run: npm install"
echo "   4. Run: npx prisma migrate dev"
echo "   5. Run: npm run dev"
echo ""
