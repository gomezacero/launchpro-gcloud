# 🚀 LaunchPro - Quick Start Guide

Get LaunchPro up and running in 10 minutes!

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] Node.js 18+ installed
- [ ] PostgreSQL 14+ running
- [ ] API credentials from:
  - [ ] Tonic for Publishers
  - [ ] Meta Ads
  - [ ] TikTok Ads
  - [ ] Anthropic Claude
  - [ ] Google Cloud Platform (with Vertex AI enabled)

## Step 1: Clone and Install

```bash
cd LaunchPro/launchpro-app/launchpro-app
npm install
```

## Step 2: Database Setup

### Option A: Local PostgreSQL

```bash
# Create database
createdb launchpro

# Update .env with your connection string
DATABASE_URL="postgresql://user:password@localhost:5432/launchpro"
```

### Option B: Docker PostgreSQL

```bash
docker run --name launchpro-postgres \
  -e POSTGRES_DB=launchpro \
  -e POSTGRES_USER=launchpro \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:14

# Use this connection string
DATABASE_URL="postgresql://launchpro:your_password@localhost:5432/launchpro"
```

## Step 3: Configure Environment

### Automated Setup (Recommended)

```bash
npm run setup:env
```

This interactive script will guide you through setting up your `.env` file.

### Manual Setup

```bash
cp ../.env.example .env
# Edit .env with your credentials
```

Required variables:

```env
# Database
DATABASE_URL="postgresql://..."

# Tonic
TONIC_API_USERNAME=your_username
TONIC_API_PASSWORD=your_password

# Meta
META_ACCESS_TOKEN=your_token
META_AD_ACCOUNT_ID=act_xxxxx

# TikTok
TIKTOK_ACCESS_TOKEN=your_token
TIKTOK_ADVERTISER_ID=your_id

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Google Cloud
GCP_PROJECT_ID=your-project-id
GCP_STORAGE_BUCKET=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
```

## Step 4: Google Cloud Setup

### 1. Create Service Account

```bash
# In Google Cloud Console
gcloud iam service-accounts create launchpro \
  --description="LaunchPro service account" \
  --display-name="LaunchPro"

# Create key
gcloud iam service-accounts keys create gcp-service-account.json \
  --iam-account=launchpro@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2. Grant Permissions

```bash
# Vertex AI User
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:launchpro@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# Storage Admin
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:launchpro@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### 3. Create Storage Bucket

```bash
gsutil mb -p YOUR_PROJECT_ID gs://launchpro-media
```

### 4. Enable Required APIs

```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable storage.googleapis.com
```

## Step 5: Database Migration

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) View database
npm run prisma:studio
```

## Step 6: Start Development Server

```bash
npm run dev
```

Visit: http://localhost:3000

## Step 7: Test the Setup

### Test API Health

```bash
curl http://localhost:3000/api/health
```

Should return:

```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "api": "operational"
  }
}
```

### Test Offers Endpoint

```bash
curl http://localhost:3000/api/offers
```

### Create Your First Campaign

1. Go to http://localhost:3000
2. Click "Create New Campaign"
3. Follow the wizard:
   - **Step 1**: Select offer, country, language
   - **Step 2**: Choose platforms (Meta/TikTok), set budget
   - **Step 3**: Review and launch!

## Troubleshooting

### Database Connection Error

```bash
# Check if PostgreSQL is running
pg_isready

# Test connection
psql $DATABASE_URL
```

### Prisma Client Not Found

```bash
npm run prisma:generate
```

### Vertex AI Authentication Error

```bash
# Verify service account key path
ls -l gcp-service-account.json

# Test gcloud authentication
gcloud auth application-default login
```

### Meta API Token Expired

- Get new token from: https://developers.facebook.com/tools/explorer/
- Update `.env`
- Restart server

### TikTok API Error

- Verify advertiser_id: https://ads.tiktok.com/i18n/account
- Check token permissions
- Update `.env`

## Next Steps

### 1. Review Documentation

- [README.md](./README.md) - Full documentation
- [Prisma Schema](./prisma/schema.prisma) - Database structure
- [API Routes](./app/api/) - API endpoints

### 2. Customize Configuration

```env
# Optional: Disable AI features for testing
ENABLE_IMAGE_GENERATION=false
ENABLE_VIDEO_GENERATION=false
```

### 3. Deploy to Production

```bash
# Build Docker image
npm run docker:build

# Deploy to Google Cloud Run
npm run deploy
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run prisma:studio` | Open database GUI |
| `npm run prisma:migrate` | Run database migrations |
| `npm run deploy` | Deploy to Google Cloud Run |

## Getting Help

- Check the logs: `tail -f logs/app.log`
- View API errors in browser console
- Check database: `npm run prisma:studio`

## What's Next?

- **Customize AI Prompts**: Edit `services/ai.service.ts`
- **Add More Platforms**: Extend `services/` directory
- **Configure Webhooks**: Set up callbacks in Tonic
- **Monitor Performance**: Add logging and metrics

---

## Quick Test Campaign (Development)

For a quick test without actual platform integration:

1. Use test credentials in `.env`
2. Comment out platform launch code in `services/campaign-orchestrator.service.ts`
3. Focus on AI content generation first
4. Gradually enable platform integrations

Happy launching! 🚀
