# 🔐 Multi-Account Setup Guide

## Overview

LaunchPro ahora soporta **múltiples cuentas** para gestionar campañas en diferentes cuentas de Tonic, Meta y TikTok simultáneamente.

### Cuentas Configuradas

✅ **2 cuentas de Tonic**:
- Tonic TikTok
- Tonic Meta

✅ **14 cuentas de Meta** (3 portfolios):
- Capital Quick LLC (2 cuentas)
- Global Qreate (4 cuentas)
- Quick Enterprise LLC (8 cuentas)

✅ **5 cuentas de TikTok**:
- TX-1, TG-JM, TQ-Les, TY-Capital, TA

## Migration Steps

### 1. Apply New Database Schema

```bash
cd LaunchPro/launchpro-app/launchpro-app

# Backup current database (if exists)
npm run prisma:migrate

# Replace schema with multi-account version
cp ../prisma/schema-multi-account.prisma ../prisma/schema.prisma

# Create new migration
npm run prisma:migrate
```

### 2. Seed Database with Accounts

El seed script ya está configurado con todas las credenciales:

```bash
npm run db:seed
```

Esto creará:
- ✅ Global settings (tokens compartidos de Meta y TikTok)
- ✅ 2 cuentas de Tonic con sus consumer keys
- ✅ 14 cuentas de Meta organizadas por portfolio
- ✅ 5 cuentas de TikTok con sus advertiser IDs

### 3. Update Environment Variables

```bash
# Actualiza tu .env con las credenciales globales
ANTHROPIC_API_KEY=tu_key
GCP_PROJECT_ID=tu_proyecto
GCP_STORAGE_BUCKET=tu_bucket
```

**Nota**: Las credenciales específicas de cada cuenta se gestionan en la base de datos, no en .env

## How It Works

### Database Structure

```
GlobalSettings (singleton)
  ├─ Shared Meta credentials
  ├─ Shared TikTok credentials
  └─ AI & Cloud credentials

Account (multiple)
  ├─ Tonic accounts (with unique consumer keys)
  ├─ Meta accounts (with unique ad account IDs)
  └─ TikTok accounts (with unique advertiser IDs)

Campaign
  └─ CampaignPlatform
      ├─ References specific Account
      └─ Stores platform-specific IDs
```

### Campaign Flow

1. **Usuario selecciona cuentas** al crear campaña:
   - Tonic account (según plataforma destino)
   - Meta account (si lanza a Meta)
   - TikTok account (si lanza a TikTok)

2. **Sistema usa credenciales correctas**:
   - Tonic: usa consumer key/secret del Account seleccionado
   - Meta: usa Ad Account ID del Account + token compartido
   - TikTok: usa Advertiser ID del Account + token compartido

3. **Tracking en base de datos**:
   - Cada CampaignPlatform referencia el Account usado
   - Permite ver qué cuenta se usó para cada campaña

## API Endpoints

### Get All Accounts

```bash
GET /api/accounts

Response:
{
  "success": true,
  "data": {
    "tonic": [...],
    "meta": {
      "all": [...],
      "byPortfolio": {
        "Capital Quick LLC": [...],
        "Global Qreate": [...],
        "Quick Enterprise LLC": [...]
      }
    },
    "tiktok": [...]
  }
}
```

### Get Accounts by Type

```bash
GET /api/accounts?type=META
GET /api/accounts?platform=tiktok
```

## Frontend Integration

### Campaign Wizard Updates

**Step 1 - Partner Settings**:
```tsx
// Selección de cuenta de Tonic
<select name="tonicAccount">
  <option value="tonic-tiktok">Tonic TikTok</option>
  <option value="tonic-meta">Tonic Meta</option>
</select>
```

**Step 2 - Campaign Settings (per platform)**:
```tsx
// Para Meta
<select name="metaAccount">
  <optgroup label="Capital Quick LLC">
    <option value="meta-b1">B1</option>
    <option value="meta-a1">A1</option>
  </optgroup>
  <optgroup label="Global Qreate">
    <option value="meta-j2">J2</option>
    <option value="meta-l2">L2</option>
    ...
  </optgroup>
</select>

// Para TikTok
<select name="tiktokAccount">
  <option value="tiktok-tx1">TX-1</option>
  <option value="tiktok-tg-jm">TG-JM</option>
  ...
</select>
```

## Service Layer Updates

### Tonic Service (Multi-Account)

```typescript
// Before (single account)
await tonicService.createCampaign({...});

// After (multi-account)
const credentials = {
  consumer_key: account.tonicConsumerKey,
  consumer_secret: account.tonicConsumerSecret
};
await tonicService.createCampaign(credentials, {...});
```

### Meta Service (Multi-Account)

```typescript
// Meta service instance per account
const metaService = new MetaService(account.metaAdAccountId);
await metaService.createCampaign({...});
```

### TikTok Service (Multi-Account)

```typescript
// TikTok service instance per account
const tiktokService = new TikTokService(account.tiktokAdvertiserId);
await tiktokService.createCampaign({...});
```

## Campaign Orchestrator Updates

```typescript
// Get accounts from database
const tonicAccount = await prisma.account.findUnique({
  where: { id: tonicAccountId }
});

const metaAccount = await prisma.account.findUnique({
  where: { id: metaAccountId }
});

// Use specific credentials
const tonicCreds = {
  consumer_key: tonicAccount.tonicConsumerKey,
  consumer_secret: tonicAccount.tonicConsumerSecret
};

await tonicService.createCampaign(tonicCreds, {...});
```

## Security Considerations

### Credential Storage

✅ **Stored in Database** (encrypted at rest):
- Tonic consumer keys/secrets
- Meta ad account IDs
- TikTok advertiser IDs

✅ **Shared Tokens** (in GlobalSettings):
- Meta access token (shared across all accounts)
- TikTok access token (shared across all accounts)
- Anthropic API key
- GCP credentials

### Access Control

- Only active accounts (`isActive: true`) are shown
- Credentials never exposed in API responses
- Services fetch credentials server-side only

## Testing

### Test Account Selection

```bash
# Get all accounts
curl http://localhost:3000/api/accounts

# Get Meta accounts only
curl http://localhost:3000/api/accounts?type=META

# Get accounts grouped
curl http://localhost:3000/api/accounts | jq '.data.meta.byPortfolio'
```

### Test Campaign Creation

```bash
curl -X POST http://localhost:3000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Multi-Account Campaign",
    "offerId": "123",
    "country": "US",
    "language": "en",
    "platforms": [
      {
        "platform": "META",
        "metaAccountId": "meta-account-id-here",
        "tonicAccountId": "tonic-meta-id-here",
        "budget": 100,
        "startDate": "2025-11-15"
      }
    ]
  }'
```

## Troubleshooting

### Issue: "Account not found"

```bash
# Check if accounts are seeded
npm run prisma:studio
# Navigate to Account table
```

### Issue: "Invalid credentials"

```bash
# Re-seed database
npm run db:seed
```

### Issue: "Schema mismatch"

```bash
# Reset and re-migrate
npm run prisma:reset
npm run prisma:migrate
npm run db:seed
```

## Next Steps

1. ✅ Apply schema migration
2. ✅ Seed accounts
3. ✅ Update frontend wizard to select accounts
4. ✅ Update services to accept credentials parameter
5. ✅ Update orchestrator to fetch account credentials
6. ✅ Test multi-account campaign creation

## Benefits

✅ **Flexibilidad**: Lanza campañas en cualquier cuenta
✅ **Organización**: Agrupa cuentas por portfolio
✅ **Tracking**: Sabe qué cuenta se usó para cada campaña
✅ **Escalabilidad**: Fácil agregar nuevas cuentas
✅ **Seguridad**: Credenciales centralizadas y seguras

---

**¿Preguntas?** Revisa los archivos:
- `prisma/schema-multi-account.prisma` - Nuevo schema
- `prisma/seed.ts` - Datos de cuentas
- `app/api/accounts/route.ts` - API de cuentas
