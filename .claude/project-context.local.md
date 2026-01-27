---
project_name: "LaunchPro"
project_type: "fullstack-saas"
stack:
  frontend:
    - "Next.js 15 (App Router)"
    - "React 19"
    - "TypeScript 5.7"
    - "Tailwind CSS 4"
    - "Lucide Icons"
  backend:
    - "Next.js API Routes"
    - "Prisma 6.2"
    - "PostgreSQL"
    - "NextAuth v5"
    - "Zod"
  ai:
    - "Anthropic Claude (claude-3.5-sonnet)"
    - "Google Vertex AI (Imagen 4, Veo 3.1)"
    - "Google Gemini"
    - "Neural Engine (Multi-Agent System)"
  infrastructure:
    - "Vercel (Serverless + Crons)"
    - "Google Cloud Storage"
    - "Supabase (DesignFlow)"
  testing: []
  ci_cd:
    - "Vercel CI"
patterns:
  architecture: "Service-Oriented (32+ services)"
  state_management: "Server State (Prisma) + React Hooks"
  api_style: "REST API Routes"
priorities:
  - "AI Integration Quality"
  - "Type Safety"
  - "Multi-Platform Reliability"
  - "Performance"
  - "Security"
enabled_agents:
  - "frontend-expert"
  - "backend-architect"
  - "ai-agents-expert"
  - "supabase-postgres-expert"
  - "performance-optimizer"
  - "agent-orchestrator"
  - "project-analyzer"
---

# LaunchPro

Plataforma SaaS de automatización de campañas publicitarias multi-plataforma con generación de contenido AI.

## Descripción del Negocio

LaunchPro automatiza el lanzamiento y gestión de campañas publicitarias en:
- **Meta Ads** (Facebook/Instagram)
- **TikTok Ads**
- **Taboola** (Native Ads)
- **Tonic** (Arbitrage/RSOC)

### Flujo Principal
1. Manager crea campaña con wizard
2. AI genera copy, keywords, imágenes/videos
3. Sistema crea artículo en Tonic
4. Obtiene tracking link
5. Lanza ads en Meta/TikTok/Taboola
6. Monitorea métricas y aplica reglas automáticas

## Estructura del Proyecto

```
LaunchPro/
├── app/                          # Next.js 15 App Router
│   ├── api/                      # 40+ API endpoints
│   │   ├── campaigns/            # CRUD campañas
│   │   ├── accounts/             # Multi-cuenta
│   │   ├── ai/                   # Generación AI
│   │   │   ├── copy-suggestions/
│   │   │   ├── generate-images/
│   │   │   └── generate-images-neural/
│   │   ├── auth/                 # NextAuth
│   │   ├── cron/                 # 8 cron jobs
│   │   ├── meta/                 # Meta API
│   │   ├── tiktok/               # TikTok API
│   │   └── dashboard/            # Métricas
│   ├── campaigns/                # Pages
│   ├── dashboard/
│   └── layout.tsx
├── components/                   # React Components
│   ├── CampaignWizard.tsx       # Wizard principal (3 pasos)
│   ├── SimpleCampaignWizard.tsx # Wizard simplificado
│   └── dashboard/               # Dashboard widgets
├── services/                     # 32+ Business Services
│   ├── ai.service.ts            # AI content generation
│   ├── campaign-orchestrator.service.ts  # Orquestador principal
│   ├── meta.service.ts          # Meta Marketing API
│   ├── tiktok.service.ts        # TikTok Ads API
│   ├── tonic.service.ts         # Tonic integration
│   ├── neural-engine/           # Multi-agent system
│   │   ├── orchestrator.ts
│   │   └── agents/              # 5 specialized agents
│   └── ...
├── lib/                          # Utilities
│   ├── auth.ts                  # NextAuth config
│   ├── prisma.ts                # Prisma client
│   ├── anthropic-client.ts      # Claude SDK
│   └── gcs.ts                   # Cloud Storage
├── hooks/                        # React Hooks
├── types/                        # TypeScript types
└── prisma/
    └── schema.prisma            # 20+ models
```

## Integración AI

### Anthropic Claude (Principal)
```typescript
// lib/anthropic-client.ts
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

**Usos:**
- Copy Master (mensaje principal)
- Keywords SEO
- Ad Copy (por plataforma)
- Articles (RSOC content)

### Google Vertex AI
- **Imagen 4 Fast**: Generación de imágenes publicitarias
- **Veo 3.1 Fast**: Generación de videos (1-8 segundos)

### Neural Engine (Multi-Agent)
Sistema de 5 agentes especializados:
1. **Global Scout** - Investigación de mercado
2. **Asset Manager** - Gestión de activos
3. **Angle Strategist** - Estrategia creativa
4. **Visual Engineer** - Generación visual
5. **Compliance Assembler** - Revisión cumplimiento

Activar con: `ENABLE_NEURAL_ENGINE=true`

## Base de Datos (Prisma + PostgreSQL)

### Modelos Principales

```prisma
// Campaña maestra
model Campaign {
  id              String           @id @default(cuid())
  name            String
  status          CampaignStatus   @default(QUEUED)
  campaignType    CampaignType     @default(CBO)

  // Tonic
  offerId         String
  tonicCampaignId String?
  tonicArticleId  String?
  tonicTrackingLink String?

  // AI Content
  copyMaster      String?
  keywords        String[]

  // Relations
  platforms       CampaignPlatform[]
  media           Media[]
  aiContent       AIContent[]
}

// Instancia por plataforma
model CampaignPlatform {
  id              String    @id @default(cuid())
  platform        Platform  // META, TIKTOK, TABOOLA
  budget          Float?

  // Meta IDs
  metaCampaignId  String?
  metaAdSetId     String?
  metaAdId        String?

  // TikTok IDs
  tiktokCampaignId String?
  tiktokAdGroupId  String?
}

// Multi-cuenta
model Account {
  id          String      @id @default(cuid())
  accountType AccountType // TONIC, META, TIKTOK, TABOOLA

  // Credentials per type
  metaAccessToken    String?
  tiktokAccessToken  String?
  taboolaAccessToken String?
}
```

### Enums Clave

```typescript
enum CampaignStatus {
  QUEUED, DRAFT, AWAITING_DESIGN, PENDING_ARTICLE,
  ARTICLE_APPROVED, AWAITING_TRACKING, GENERATING_AI,
  READY_TO_LAUNCH, LAUNCHING, ACTIVE, PAUSED,
  COMPLETED, FAILED
}

enum Platform { TONIC, META, TIKTOK, TABOOLA }
enum AccountType { TONIC, META, TIKTOK, TABOOLA }
enum MediaType { IMAGE, VIDEO }
enum ManagerRole { SUPERADMIN, MANAGER }
```

## Autenticación (NextAuth v5)

```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        // bcryptjs.compare() para verificar
      }
    })
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }
});
```

**Roles:** `SUPERADMIN`, `MANAGER`

## Servicios Críticos

### Campaign Orchestrator
`services/campaign-orchestrator.service.ts`
- Coordina todo el flujo de campaña
- Maneja estados y transiciones
- Logging de auditoría

### AI Service
`services/ai.service.ts`
- `generateCopyMaster()` - Mensaje principal
- `generateKeywords()` - SEO keywords
- `generateAdCopy()` - Copy por plataforma
- `generateImages()` - Vertex AI images
- `generateVideos()` - Veo videos

### Platform Services
- `meta.service.ts` - Meta Marketing API
- `tiktok.service.ts` - TikTok Ads API
- `taboola.service.ts` - Taboola Backstage API
- `tonic.service.ts` - Tonic OAuth + API

## Cron Jobs (Vercel)

| Cron | Frecuencia | Función |
|------|------------|---------|
| check-articles | 10 min | Verificar aprobación Tonic |
| poll-tracking-links | 10 min | Obtener tracking links |
| process-campaigns | 30 min | Procesar cola de campañas |
| evaluate-rules | 1 hora | Evaluar reglas Meta |
| evaluate-tiktok-rules | 1 hora | Evaluar reglas TikTok |
| daily-metrics | Diario 6am | Calcular métricas |
| stop-loss | 1 hora | Monitorear pérdidas |

## Convenciones de Código

### Nombrado
- **Componentes**: PascalCase (`CampaignWizard`)
- **Servicios**: kebab-case + `.service.ts` (`ai.service.ts`)
- **Hooks**: camelCase con `use` (`useAuth`)
- **Types**: PascalCase (`CampaignStatus`)
- **API Routes**: kebab-case (`/api/copy-suggestions`)

### Imports
```typescript
// Path aliases
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { AIService } from '@/services/ai.service';
```

### Error Handling
```typescript
try {
  // operation
} catch (error) {
  logger.error('Context', { error, details });
  return NextResponse.json({ error: 'Message' }, { status: 500 });
}
```

## Variables de Entorno Críticas

```bash
# Database
DATABASE_URL=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# AI
ANTHROPIC_API_KEY=
GCP_PROJECT_ID=
GCP_LOCATION=

# Platforms
META_ACCESS_TOKEN=
TIKTOK_ACCESS_TOKEN=
TABOOLA_CLIENT_ID=

# Storage
GCP_STORAGE_BUCKET=

# Feature Flags
ENABLE_NEURAL_ENGINE=false
```

## Comandos

```bash
npm run dev          # Desarrollo (puerto 3000)
npm run build        # Build producción
npm run start        # Servidor producción
npx prisma studio    # GUI base de datos
npx prisma migrate   # Migraciones
npx prisma generate  # Regenerar client
```

## Notas para Agentes

### frontend-expert
- Next.js 15 App Router (NO Pages Router)
- React 19 con hooks modernos
- Tailwind CSS 4 (nueva sintaxis)
- Componentes en `/components`

### backend-architect
- API Routes en `/app/api`
- Servicios en `/services` (32+ archivos)
- Prisma como ORM único
- NextAuth v5 para auth

### ai-agents-expert
- Claude es el AI principal (copy, keywords)
- Vertex AI para imágenes/videos
- Neural Engine es sistema multi-agente interno
- Ver `services/ai.service.ts` y `services/neural-engine/`

### supabase-postgres-expert
- PostgreSQL via Prisma (NO Supabase directo)
- Schema en `prisma/schema.prisma`
- 20+ modelos relacionados
- Migraciones con Prisma Migrate

### performance-optimizer
- Serverless en Vercel (cold starts)
- Cron jobs con timeouts largos (hasta 800s)
- AI calls pueden ser lentos
- Considerar caching semántico

### agent-orchestrator
- Usar para tareas que cruzan frontend + backend + AI
- Ejemplo: "Agregar nuevo tipo de campaña" (requiere DB + API + UI + AI)
- Coordina múltiples especialistas en secuencia

### project-analyzer
- Para entender flujos complejos del sistema
- Mapear dependencias entre servicios
- Analizar el Neural Engine multi-agente

## Debugging

### Logs
```typescript
// lib/logger.ts - Logger centralizado
import { logger } from '@/lib/logger';
logger.info('Context', { data });
logger.error('Error', { error, stack });
```

### Campaign Logs
```typescript
// lib/campaign-logger.ts
import { CampaignLogger } from '@/lib/campaign-logger';
await CampaignLogger.log(campaignId, 'STEP', 'Message', { details });
```

### Scripts de Debug
```bash
scripts/debug-tiktok.ts      # Debug TikTok API
scripts/fetch-tonic-link.ts  # Debug Tonic
scripts/test-vertex-video.ts # Debug Vertex AI
```

### Prisma Studio
```bash
npx prisma studio  # GUI para inspeccionar DB
```

## Flujos Críticos para Debugging

### Flujo de Campaña
```
QUEUED → DRAFT → PENDING_ARTICLE → ARTICLE_APPROVED
→ AWAITING_TRACKING → GENERATING_AI → READY_TO_LAUNCH
→ LAUNCHING → ACTIVE
```

### Errores Comunes
1. **Tonic OAuth expired** - Regenerar JWT en Account
2. **Meta rate limit** - Esperar o usar otra cuenta
3. **TikTok identity missing** - Verificar tiktokIdentityId
4. **Vertex AI quota** - Verificar GCP billing
5. **Prisma connection** - Verificar DATABASE_URL

### Auditoría
```typescript
// Todos los cambios se logean en CampaignAuditLog
model CampaignAuditLog {
  action    String    // CREATE, UPDATE, LAUNCH, ERROR
  details   Json
  timestamp DateTime
}
```
