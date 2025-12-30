# LaunchPro - Contexto para Claude

## Descripción del Proyecto
LaunchPro es una plataforma para lanzar campañas publicitarias automáticamente en Meta (Facebook/Instagram) y TikTok, utilizando Tonic como intermediario para tracking y artículos RSOC.

## Stack Tecnológico
- **Frontend**: Next.js 15 (App Router), React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes (serverless en Vercel)
- **Base de datos**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Storage**: Google Cloud Storage
- **IA**: Anthropic Claude (texto), Google Vertex AI (imágenes/videos)
- **Deploy**: Vercel (con cron jobs cada minuto)

## Estructura del Proyecto
```
launchpro-app/launchpro-app/
├── app/                    # Next.js App Router
│   ├── api/               # API endpoints
│   │   ├── campaigns/     # CRUD campañas + media upload
│   │   ├── cron/          # check-articles, process-campaigns
│   │   └── ...
│   └── (pages)/           # UI pages
├── components/            # React components (CampaignWizard.tsx es clave)
├── services/              # Business logic
│   ├── ai.service.ts      # Generación de contenido con IA
│   ├── campaign-orchestrator.service.ts  # Orquestador principal
│   ├── meta.service.ts    # Meta Ads API
│   ├── tiktok.service.ts  # TikTok Ads API
│   └── tonic.service.ts   # Tonic API
├── lib/                   # Utilidades (prisma, logger, gcs, env)
└── prisma/               # Schema de base de datos
```

## Flujo de Campaña
1. Usuario crea campaña en wizard → `POST /api/campaigns`
2. Se crea campaña en Tonic → espera aprobación de artículo
3. Cron job `check-articles` verifica aprobación cada minuto
4. Cuando se aprueba → `process-campaigns` genera contenido IA y lanza a Meta/TikTok

## Archivos Clave
- `services/ai.service.ts` - Prompts de IA (Copy Master, Keywords, Article, Ad Copy)
- `services/campaign-orchestrator.service.ts` - Lógica principal de lanzamiento
- `components/CampaignWizard.tsx` - Wizard de creación de campañas
- `prisma/schema.prisma` - Modelo de datos

## Variables de Entorno Requeridas
```
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=...
GCP_PROJECT_ID=golden-object-417600
GCP_LOCATION=us-central1
GCP_STORAGE_BUCKET=launchpro-media
GCP_SERVICE_ACCOUNT_KEY={...json...}
META_ACCESS_TOKEN=...
TIKTOK_ACCESS_TOKEN=...
TONIC_CONSUMER_KEY=...
TONIC_CONSUMER_SECRET=...
```

## URLs Importantes
- Producción: https://launchproquick.vercel.app
- Deploy Hook: desactualizada

## Comandos Útiles
```bash
# Desarrollo local
cd launchpro-app/launchpro-app
npm run dev

# Build
npm run build

# Push cambios de Prisma a DB
npx prisma db push

# Ver DB en browser
npx prisma studio

# Deploy (después de push a git)
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_dXZFrfPE7cDNbrOAtaOrjwkChZIu/T4iytLt3OH"
```

## Problemas Resueltos Recientemente
1. GCS credentials en Vercel (usar GCP_SERVICE_ACCOUNT_KEY como JSON string)
2. Race condition en uploads múltiples (namespacing por sesión)
3. Límite de 4.5MB en Vercel (direct upload a GCS con signed URLs)
4. CORS para uploads directos a GCS
