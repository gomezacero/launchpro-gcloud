# 🚀 LaunchPro - Digital Ads Campaign Management Platform

LaunchPro is a comprehensive web application for launching digital advertising campaigns across **Tonic**, **Meta Ads (Facebook/Instagram)**, and **TikTok Ads** with AI-powered content generation.

## 🌟 Key Features

- **Multi-Platform Campaign Launch**: Create campaigns simultaneously on Tonic, Meta, and TikTok
- **AI Content Generation**:
  - Copy Master generation (Anthropic Claude)
  - Keyword optimization
  - Article creation for RSOC campaigns
  - Ad copy tailored for each platform
  - **Image generation** (Google Vertex AI Imagen 4 Fast)
  - **Video generation** (Google Vertex AI Veo 3.1 Fast)
- **Workflow Orchestration**: Automated campaign flow from Tonic → AI Content → Platform Launch
- **Campaign Management**: Track all campaigns, their status, performance, and media assets
- **Pixel Tracking**: Automatic configuration of tracking pixels for conversion monitoring

## 🏗️ Architecture

### Tech Stack

- **Frontend & Backend**: Next.js 14 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **AI Services**:
  - Anthropic Claude 3.5 Sonnet (text generation)
  - Google Vertex AI Imagen 4 Fast (image generation)
  - Google Vertex AI Veo 3.1 Fast (video generation)
- **Ad Platforms**:
  - Tonic for Publishers API
  - Meta Marketing API (Facebook/Instagram)
  - TikTok Ads API
- **Storage**: Google Cloud Storage (for generated media)
- **Deployment**: Google Cloud Run (recommended)

### Campaign Flow

```
┌─────────────┐
│   Campaign  │
│   Created   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Create in  │
│    Tonic    │──► Get Tracking Link
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ AI Content  │
│ Generation  │
├─────────────┤
│ • Copy      │
│ • Keywords  │
│ • Articles  │
│ • Ad Copy   │
│ • Images    │
│ • Videos    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│  Launch to Platforms    │
├─────────────────────────┤
│ • Meta (FB/IG)          │
│   - Campaign            │
│   - Ad Set              │
│   - Ad Creative         │
│   - Ad                  │
│                         │
│ • TikTok                │
│   - Campaign            │
│   - Ad Group            │
│   - Ad                  │
└───────────┬─────────────┘
            │
            ▼
     ┌─────────────┐
     │   Configure │
     │   Pixels    │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │   ACTIVE    │
     │  Campaign   │
     └─────────────┘
```

## 📋 Prerequisites

Before you begin, ensure you have the following:

### Required Accounts & API Keys

1. **Tonic for Publishers**
   - Username & Password (API credentials)
   - Get from: https://publisher.tonic.com/privileged/account/settings

2. **Meta Ads**
   - Access Token (long-lived)
   - Ad Account ID
   - App ID & App Secret (for advanced features)
   - Pixel ID (optional)
   - Get from: https://developers.facebook.com/

3. **TikTok Ads**
   - Access Token
   - Advertiser ID
   - App ID & App Secret (for OAuth)
   - Pixel ID (optional)
   - Get from: https://ads.tiktok.com/marketing_api/

4. **Anthropic Claude**
   - API Key
   - Get from: https://console.anthropic.com/

5. **Google Cloud Platform**
   - Project ID
   - Service Account with:
     - Vertex AI User role
     - Storage Admin role
   - Service Account JSON key file
   - Get from: https://console.cloud.google.com/

### System Requirements

- Node.js 18+ and npm
- PostgreSQL 14+
- Google Cloud SDK (for deployment)

## 🚀 Getting Started

### 1. Clone and Setup

```bash
cd LaunchPro/launchpro-app
npm install
```

### 2. Database Setup

```bash
# Create a PostgreSQL database
createdb launchpro

# Or use Docker
docker run --name launchpro-postgres \
  -e POSTGRES_DB=launchpro \
  -e POSTGRES_USER=your_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:14
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/launchpro?schema=public"

# Tonic API
TONIC_API_USERNAME=your_username
TONIC_API_PASSWORD=your_password

# Meta Ads
META_ACCESS_TOKEN=your_access_token
META_AD_ACCOUNT_ID=act_1234567890
META_PIXEL_ID=your_pixel_id

# TikTok Ads
TIKTOK_ACCESS_TOKEN=your_access_token
TIKTOK_ADVERTISER_ID=your_advertiser_id

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# Google Cloud
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GCP_STORAGE_BUCKET=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
```

### 4. Database Migration

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view database
npx prisma studio
```

### 5. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

## 📡 API Endpoints

### Campaigns

- `GET /api/campaigns` - List all campaigns
- `GET /api/campaigns?status=ACTIVE` - Filter by status
- `POST /api/campaigns` - Create and launch a new campaign
- `GET /api/campaigns/[id]` - Get campaign details
- `PATCH /api/campaigns/[id]` - Update campaign
- `DELETE /api/campaigns/[id]` - Delete campaign

### Offers

- `GET /api/offers` - Get all offers from Tonic
- `GET /api/offers?country=US` - Get offers for a specific country

### Countries

- `GET /api/countries` - Get all available countries
- `GET /api/countries?offerId=123` - Get countries for a specific offer

## 🎯 Creating a Campaign

### API Request Example

```bash
curl -X POST http://localhost:3000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Car Loans Summer Campaign",
    "campaignType": "CBO",
    "offerId": "123",
    "country": "US",
    "language": "en",
    "platforms": [
      {
        "platform": "META",
        "performanceGoal": "Lead Generation",
        "budget": 100,
        "startDate": "2025-11-15T00:00:00Z",
        "generateWithAI": true
      },
      {
        "platform": "TIKTOK",
        "performanceGoal": "Lead Generation",
        "budget": 50,
        "startDate": "2025-11-15T00:00:00Z",
        "generateWithAI": true
      }
    ]
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "campaignId": "clx123...",
    "tonicCampaignId": "456",
    "tonicTrackingLink": "123456.track.com",
    "platforms": [
      {
        "platform": "META",
        "success": true,
        "campaignId": "120210234567890",
        "adSetId": "120210234567891",
        "adId": "120210234567892"
      },
      {
        "platform": "TIKTOK",
        "success": true,
        "campaignId": "1234567890",
        "adGroupId": "9876543210",
        "adId": "1122334455"
      }
    ],
    "aiContent": {
      "copyMaster": "Get approved for your dream car today...",
      "keywords": ["car loans", "auto financing", "low interest rates"],
      "article": {
        "headline": "5 Ways to Get the Best Car Loan Rate in 2025",
        "teaser": "Finding the perfect car loan doesn't have to be complicated..."
      },
      "media": {
        "images": ["https://storage.googleapis.com/.../image1.png"],
        "videos": ["https://storage.googleapis.com/.../video1.mp4"]
      }
    }
  }
}
```

## 🗄️ Database Schema

Key models:

- **Campaign**: Main campaign entity with status tracking
- **Offer**: Offers from Tonic
- **CampaignPlatform**: Many-to-many relationship between campaigns and platforms
- **AIContent**: AI-generated content (copy, keywords, articles)
- **Media**: Generated images and videos

See `prisma/schema.prisma` for the complete schema.

## 🎨 AI Content Generation

### Copy Master

AI-generated central communication message aligned with the offer.

### Keywords

3-10 SEO-optimized keywords for Tonic campaigns.

### Articles (RSOC)

- Headline (max 256 chars)
- Teaser (250-1000 chars)
- Content generation phrases

### Ad Copy

Platform-specific ad copy:
- Primary text
- Headline
- Description
- Call-to-action

### Images

Generated with **Imagen 4 Fast** (Google Vertex AI):
- Aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4
- Optimized for each platform

### Videos

Generated with **Veo 3.1 Fast** (Google Vertex AI):
- Duration: 1-8 seconds
- Aspect ratios: 16:9, 9:16, 1:1
- Native audio support

## 📊 Campaign Statuses

- `DRAFT`: Initial creation
- `GENERATING_AI`: AI is generating content
- `READY_TO_LAUNCH`: AI content ready
- `LAUNCHING`: Launching to platforms
- `ACTIVE`: Successfully launched
- `PAUSED`: Paused by user
- `COMPLETED`: Campaign finished
- `FAILED`: Launch failed

## 🔧 Development

### Project Structure

```
launchpro-app/
├── app/
│   ├── api/              # API routes
│   │   ├── campaigns/
│   │   ├── offers/
│   │   └── countries/
│   ├── page.tsx          # Homepage
│   └── layout.tsx        # Root layout
├── services/             # Business logic
│   ├── tonic.service.ts
│   ├── meta.service.ts
│   ├── tiktok.service.ts
│   ├── ai.service.ts
│   └── campaign-orchestrator.service.ts
├── lib/                  # Utilities
│   ├── prisma.ts
│   └── env.ts
├── prisma/
│   └── schema.prisma     # Database schema
├── .env                  # Environment variables
└── package.json
```

### Testing Services

You can test individual services in Node.js:

```typescript
import { tonicService } from './services/tonic.service';

// Test Tonic authentication
const token = await tonicService.authenticate();
console.log('Token:', token);

// Get offers
const offers = await tonicService.getOffers();
console.log('Offers:', offers);
```

## 🚢 Deployment

### Google Cloud Run (Recommended)

1. **Build Docker image**:

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

2. **Deploy**:

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/launchpro

# Deploy to Cloud Run
gcloud run deploy launchpro \
  --image gcr.io/YOUR_PROJECT_ID/launchpro \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "$(cat .env.production)"
```

### Alternative: Vercel

```bash
npm install -g vercel
vercel
```

## 🔐 Security Best Practices

1. **Never commit `.env`** to version control
2. **Use environment-specific credentials**
3. **Rotate API keys regularly**
4. **Enable CORS** only for trusted domains
5. **Use HTTPS** in production
6. **Implement rate limiting** on API endpoints
7. **Store service account keys** in Google Secret Manager (production)

## 🤝 Contributing

This is an internal tool. For questions or issues, contact the development team.

## 📄 License

Proprietary - All rights reserved.

## 🆘 Troubleshooting

### Prisma Client Issues

```bash
npx prisma generate
npx prisma migrate reset
```

### Vertex AI Authentication

```bash
# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS="./gcp-service-account.json"

# Test with gcloud CLI
gcloud auth application-default login
```

### Meta API Errors

- Verify your access token is not expired
- Check ad account permissions
- Ensure page access for creatives

### TikTok API Errors

- Verify advertiser_id is correct
- Check access token permissions
- Ensure video files meet TikTok requirements

## 📞 Support

For issues, please check:
- [Tonic API Docs](https://publisher.tonic.com/api-docs)
- [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis)
- [TikTok Ads API](https://ads.tiktok.com/marketing_api/docs)
- [Anthropic API](https://docs.anthropic.com/)
- [Vertex AI](https://cloud.google.com/vertex-ai/docs)

---

Built with ❤️ by the LaunchPro Team
