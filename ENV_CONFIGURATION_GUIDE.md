# Guía de Configuración de Variables de Entorno

## Resumen Ejecutivo

LaunchPro utiliza una arquitectura **multi-cuenta híbrida** que combina credenciales almacenadas en la base de datos con tokens de acceso compartidos en variables de entorno. Este documento explica cómo configurar correctamente las variables de entorno para el funcionamiento óptimo del sistema.

---

## 🏗️ Arquitectura Multi-Cuenta

### Principio Fundamental

**UN token de acceso → MÚLTIPLES cuentas publicitarias**

LaunchPro no requiere que configures cada cuenta individual en el archivo `.env`. En su lugar:

1. **Tonic**: Credenciales específicas por cuenta almacenadas en la base de datos
2. **Meta (Facebook/Instagram)**: Un solo token de acceso para todas las cuentas
3. **TikTok**: Un solo token de acceso para todas las cuentas

### ¿Cómo funciona?

```
┌─────────────────────────────────────────────────────────────┐
│                      ARCHIVO .env                           │
│                                                             │
│  ✓ UN token de Meta    → Accede a TODAS las cuentas Meta  │
│  ✓ UN token de TikTok  → Accede a TODAS las cuentas TikTok│
│  ✗ NO necesitas listar cada cuenta aquí                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  BASE DE DATOS (Account)                    │
│                                                             │
│  • Cuenta Tonic #1 (consumer_key: abc123...)               │
│  • Cuenta Tonic #2 (consumer_key: def456...)               │
│  • Cuenta Meta A1 (ad_account_id: act_12345)               │
│  • Cuenta Meta B1 (ad_account_id: act_67890)               │
│  • Cuenta TikTok TX-1 (advertiser_id: 747656377...)        │
│  • ... (21 cuentas pre-configuradas)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   APIS EN TIEMPO REAL                       │
│                                                             │
│  GET /api/ad-accounts?platform=meta                         │
│    → Obtiene TODAS las cuentas desde Meta Graph API        │
│                                                             │
│  GET /api/ad-accounts?platform=tiktok                       │
│    → Obtiene TODAS las cuentas desde TikTok Ads API        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Variables Requeridas vs Opcionales

### ✅ CRÍTICAS (Requeridas)

Estas variables son absolutamente necesarias para que la aplicación funcione:

```bash
# Base de datos
DATABASE_URL="postgresql://user:pass@host:port/db"

# IA - Generación de contenido
ANTHROPIC_API_KEY="sk-ant-api03-..."

# GCP - Generación de imágenes y videos
GCP_PROJECT_ID="your-project-id"
GCP_STORAGE_BUCKET="launchpro-media"

# Meta - Token compartido
META_ACCESS_TOKEN="EAAxxxxx..."

# TikTok - Token compartido
TIKTOK_ACCESS_TOKEN="9f175xxx..."
```

### 🟡 OPCIONALES (Con valores por defecto)

Estas variables tienen valores por defecto sensatos:

```bash
# Tonic (ahora se usa la BD en su lugar)
TONIC_API_USERNAME=optional
TONIC_API_PASSWORD=optional
TONIC_API_BASE_URL=https://api.publisher.tonic.com  # Default

# Meta
META_AD_ACCOUNT_ID=act_1234567890  # Fallback
META_API_VERSION=v21.0  # Default

# TikTok
TIKTOK_ADVERTISER_ID=747656377...  # Fallback

# GCP
GCP_LOCATION=us-central1  # Default

# App
NODE_ENV=development  # Default
NEXT_PUBLIC_APP_URL=http://localhost:3001  # Default
```

### 🔵 AVANZADAS (Solo si necesitas funcionalidades específicas)

```bash
# Creación de píxeles
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_PIXEL_ID=your_pixel_id

TIKTOK_APP_ID=your_app_id
TIKTOK_APP_SECRET=your_app_secret
TIKTOK_PIXEL_ID=your_pixel_id

# Credenciales de GCP (alternativa a variable de entorno)
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
```

---

## 🔐 Obtención de Credenciales

### 1. Meta Access Token (Permanente)

#### Opción A: System User (Recomendado para producción)

```
1. Ve a Meta Business Manager
2. Settings > Users > System Users
3. Crea un nuevo System User
4. Asigna permisos: "Manage Ad Accounts"
5. Genera un token permanente
6. Guárdalo en META_ACCESS_TOKEN
```

**Ventaja**: Token que nunca expira

#### Opción B: User Access Token (Para desarrollo)

```
1. Ve a https://developers.facebook.com/tools/explorer/
2. Selecciona tu app
3. Otorga permisos: ads_management, ads_read, business_management
4. Genera token
5. Extiéndelo a 60 días:
   https://graph.facebook.com/oauth/access_token?
     grant_type=fb_exchange_token&
     client_id=YOUR_APP_ID&
     client_secret=YOUR_APP_SECRET&
     fb_exchange_token=SHORT_LIVED_TOKEN
```

**Desventaja**: Expira en 60 días

### 2. TikTok Access Token

```
1. Ve a https://business-api.tiktok.com/
2. Crea una app
3. Ve a Authorization
4. Completa OAuth2 flow
5. Genera long-lived access token
6. Guárdalo en TIKTOK_ACCESS_TOKEN
```

### 3. Anthropic API Key

```
1. Crea cuenta en https://console.anthropic.com
2. Settings > API Keys
3. Create Key
4. Guárdalo en ANTHROPIC_API_KEY
```

### 4. Google Cloud Platform

```
1. Crea proyecto en https://console.cloud.google.com
2. Habilita APIs:
   - Vertex AI API
   - Cloud Storage API
3. Crea Service Account:
   - IAM & Admin > Service Accounts
   - Permisos: Vertex AI User, Storage Object Admin
4. Genera JSON key
5. Guárdalo como gcp-service-account.json
6. Crea bucket en Cloud Storage
```

---

## 🎯 Gestión de Múltiples Cuentas

### Cuentas de Tonic

Las cuentas de Tonic se gestionan **exclusivamente en la base de datos**:

```sql
-- Ver cuentas de Tonic
SELECT id, name, tonicConsumerKey, isActive
FROM Account
WHERE accountType = 'TONIC';

-- Agregar nueva cuenta (vía seed o UI)
INSERT INTO Account (
  id, name, accountType,
  tonicConsumerKey, tonicConsumerSecret,
  isActive
) VALUES (
  'tonic-meta-2',
  'Tonic Meta Account 2',
  'TONIC',
  'your_consumer_key',
  'your_consumer_secret',
  true
);
```

**No necesitas modificar el .env para agregar cuentas Tonic.**

### Cuentas de Meta

Las cuentas de Meta se obtienen **dinámicamente desde la API**:

```typescript
// El sistema hace esto automáticamente:
GET https://graph.facebook.com/v21.0/me/adaccounts
  ?access_token=YOUR_META_ACCESS_TOKEN
  &fields=id,name,account_id,account_status

// Respuesta:
{
  "data": [
    { "id": "act_641975565566309", "name": "Capital Quick LLC - Account B1" },
    { "id": "act_123456789", "name": "Global Qreate - Account J2" },
    // ... todas las cuentas accesibles con tu token
  ]
}
```

**El usuario selecciona la cuenta deseada al crear cada campaña.**

### Cuentas de TikTok

Las cuentas de TikTok se obtienen **dinámicamente desde la API**:

```typescript
// El sistema hace esto automáticamente:
GET https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/
  ?access_token=YOUR_TIKTOK_ACCESS_TOKEN

// Respuesta:
{
  "data": {
    "list": [
      { "advertiser_id": "7476563770333167633", "advertiser_name": "TX-1" },
      { "advertiser_id": "7477654321123456789", "advertiser_name": "TG-JM" },
      // ... todas las cuentas accesibles con tu token
    ]
  }
}
```

**El usuario selecciona la cuenta deseada al crear cada campaña.**

---

## 🚀 Flujo de Trabajo del Usuario

### Al crear una campaña:

```
1. Usuario inicia CampaignWizard
   ↓
2. Selecciona cuenta de Tonic (desde BD)
   → Sistema recupera credenciales y autentica
   ↓
3. Configura campaña en Tonic
   ↓
4. Genera contenido con IA (Claude, Imagen, Veo)
   ↓
5. Selecciona plataformas destino: Meta, TikTok, o ambas
   ↓
6a. Si Meta:
    → Sistema obtiene lista de ad accounts desde API
    → Usuario selecciona cuenta específica (ej: "Account B1")
    → Campaña se lanza a esa cuenta

6b. Si TikTok:
    → Sistema obtiene lista de advertisers desde API
    → Usuario selecciona cuenta específica (ej: "TX-1")
    → Campaña se lanza a esa cuenta
   ↓
7. Campaña creada en múltiples plataformas
```

---

## 📁 Archivos Relacionados

| Archivo | Propósito |
|---------|-----------|
| `launchpro-app/.env.example` | Plantilla con todas las variables documentadas |
| `launchpro-app/.env` | Tu configuración real (NO committear) |
| `launchpro-app/lib/env.ts` | Validación de variables con Zod |
| `launchpro-app/prisma/schema.prisma` | Esquema de BD (modelo Account) |
| `launchpro-app/prisma/seed.ts` | Script para poblar cuentas iniciales |
| `MULTI_ACCOUNT_SETUP.md` | Guía de migración a multi-cuenta |
| `TONIC_API_Documentation.md` | Documentación completa de Tonic API |

---

## 🔧 Troubleshooting

### Error: "Missing environment variable: META_ACCESS_TOKEN"

**Causa**: No se configuró el token de Meta
**Solución**: Agrega `META_ACCESS_TOKEN=tu_token_aqui` al archivo `.env`

### Error: "Invalid Meta credentials"

**Causa**: Token expirado o con permisos insuficientes
**Solución**:
1. Verifica que el token no haya expirado
2. Asegúrate de tener permisos `ads_management`
3. Regenera el token si es necesario

### Error: "No ad accounts found"

**Causa**: El token no tiene acceso a cuentas publicitarias
**Solución**:
1. Ve a Meta Business Manager
2. Asigna el usuario/app a las cuentas publicitarias
3. Otorga permisos de "Manage Campaigns"

### No veo todas mis cuentas

**Causa**: El token solo tiene acceso a cuentas específicas
**Solución**: Asegúrate de que el token tenga acceso a todas las cuentas en Business Manager

### Error: "TONIC_API_USERNAME is required"

**Causa**: Código legacy aún requiere estas variables
**Solución temporal**: Agrega valores dummy:
```bash
TONIC_API_USERNAME=not_used
TONIC_API_PASSWORD=not_used
```

Las cuentas Tonic se usarán desde la base de datos.

---

## 🎓 Ejemplo de Configuración Completa

### Archivo `.env` mínimo funcional:

```bash
# Base de datos
DATABASE_URL="postgresql://postgres:password@localhost:5432/launchpro?schema=public"

# IA
ANTHROPIC_API_KEY="sk-ant-api03-tu_key_aqui"

# GCP
GCP_PROJECT_ID="golden-object-417600"
GCP_STORAGE_BUCKET="launchpro-media"
GOOGLE_APPLICATION_CREDENTIALS="./gcp-service-account.json"

# Meta (UN token para TODAS las cuentas)
META_ACCESS_TOKEN="EAAtu_token_de_meta_aqui"

# TikTok (UN token para TODAS las cuentas)
TIKTOK_ACCESS_TOKEN="tu_token_de_tiktok_aqui"

# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Con esto, tienes acceso a:
- ✅ Todas las cuentas de Tonic en la BD
- ✅ Todas las cuentas de Meta asociadas al token
- ✅ Todas las cuentas de TikTok asociadas al token
- ✅ Generación de contenido con IA
- ✅ Gestión de campañas multi-plataforma

---

## 📞 Referencias

- **Meta Graph API**: https://developers.facebook.com/docs/graph-api
- **TikTok Business API**: https://business-api.tiktok.com/portal/docs
- **Anthropic Claude**: https://console.anthropic.com/docs
- **Google Vertex AI**: https://cloud.google.com/vertex-ai/docs
- **Tonic Publishers**: https://publisher.tonic.com

---

## 🔒 Mejores Prácticas de Seguridad

1. **Nunca committear el archivo .env**
   - Ya está en `.gitignore`
   - Verifica: `git status` no debe mostrarlo

2. **Rotar tokens regularmente**
   - Meta: Cada 60 días (o usar System User)
   - TikTok: Según política de tu organización
   - Anthropic: Cada 6 meses

3. **Usar System Users en producción**
   - Tokens que nunca expiran
   - No vinculados a usuarios individuales
   - Mejor control de permisos

4. **Separar ambientes**
   ```
   .env.development  → Tokens de desarrollo
   .env.production   → Tokens de producción
   .env.test         → Tokens de testing
   ```

5. **Usar Secret Managers en producción**
   - AWS Secrets Manager
   - Google Secret Manager
   - Azure Key Vault
   - Evita almacenar tokens en archivos

---

## ✅ Checklist de Configuración

- [ ] Copié `.env.example` como `.env`
- [ ] Configuré `DATABASE_URL` con mi PostgreSQL
- [ ] Obtuve y configuré `ANTHROPIC_API_KEY`
- [ ] Configuré proyecto de GCP y `GCP_PROJECT_ID`
- [ ] Creé bucket y configuré `GCP_STORAGE_BUCKET`
- [ ] Descargué credenciales de GCP Service Account
- [ ] Obtuve `META_ACCESS_TOKEN` con permisos ads_management
- [ ] Obtuve `TIKTOK_ACCESS_TOKEN` de TikTok Business API
- [ ] Ejecuté `npm install` para instalar dependencias
- [ ] Ejecuté `npx prisma migrate dev` para crear tablas
- [ ] Ejecuté `npx prisma db seed` para poblar cuentas iniciales
- [ ] Verifiqué que `npm run dev` inicia sin errores
- [ ] Probé crear una campaña en el wizard

---

**¿Preguntas?** Consulta la documentación completa en `/MULTI_ACCOUNT_SETUP.md` o revisa los archivos de servicios en `launchpro-app/services/`.
