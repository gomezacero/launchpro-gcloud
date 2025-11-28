# Guía de Setup y Producción - LaunchPro

## Tabla de Contenidos
1. [Setup en Nueva Máquina (Desarrollo)](#1-setup-en-nueva-máquina-desarrollo)
2. [Opciones de Producción](#2-opciones-de-producción)
3. [Opción Recomendada: Google Cloud Run](#3-opción-recomendada-google-cloud-run)
4. [Otras Opciones de Hosting](#4-otras-opciones-de-hosting)
5. [Comparativa de Costos](#5-comparativa-de-costos)

---

## 1. Setup en Nueva Máquina (Desarrollo)

### Requisitos Previos
Instalar en la nueva máquina (Mac/Windows/Linux):

```bash
# 1. Node.js (versión 18 o superior)
# Mac: https://nodejs.org o con Homebrew:
brew install node

# 2. Git
# Mac:
brew install git

# 3. PostgreSQL (base de datos)
# Mac:
brew install postgresql@15
brew services start postgresql@15
```

### Pasos para Configurar el Proyecto

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPO> LaunchPro
cd LaunchPro/launchpro-app/launchpro-app

# 2. Instalar dependencias
npm install

# 3. Copiar archivo de variables de entorno
cp .env.example .env
# (Si no existe .env.example, crear .env manualmente - ver sección abajo)

# 4. Configurar la base de datos
# Crear base de datos en PostgreSQL:
createdb launchpro

# 5. Ejecutar migraciones de Prisma
npx prisma migrate deploy

# 6. Generar cliente de Prisma
npx prisma generate

# 7. (Opcional) Cargar datos iniciales si hay seed
npx prisma db seed

# 8. Iniciar el servidor de desarrollo
npm run dev
```

### Archivo .env Necesario

```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/launchpro"

# Next.js
NEXTAUTH_SECRET="tu-secret-aleatorio-aqui"
NEXTAUTH_URL="http://localhost:3000"

# APIs externas (copiar de tu .env actual)
# Meta
META_APP_ID="..."
META_APP_SECRET="..."
META_ACCESS_TOKEN="..."

# TikTok
TIKTOK_ACCESS_TOKEN="..."

# Tonic
TONIC_CONSUMER_KEY="..."
TONIC_CONSUMER_SECRET="..."

# Google Cloud (si aplica)
GCP_PROJECT_ID="..."
GCP_SERVICE_ACCOUNT_KEY="..."
GCP_STORAGE_BUCKET="..."

# Anthropic (AI)
ANTHROPIC_API_KEY="..."
```

### Comandos Útiles

```bash
# Ver la base de datos en navegador
npx prisma studio

# Resetear base de datos (CUIDADO: borra todo)
npx prisma migrate reset

# Crear nueva migración después de cambiar schema.prisma
npx prisma migrate dev --name nombre_del_cambio
```

---

## 2. Opciones de Producción

### ¿Qué necesitas para producción?

| Componente | Descripción |
|------------|-------------|
| **Hosting de la App** | Servidor que corre tu código Next.js |
| **Base de Datos** | PostgreSQL en la nube |
| **Dominio** | URL para acceder (ej: launchpro.tuempresa.com) |
| **SSL** | Certificado HTTPS (gratis con la mayoría de servicios) |

### Nivel de Dificultad por Opción

| Opción | Dificultad | Costo Mensual | Ideal Para |
|--------|------------|---------------|------------|
| **Vercel** | ⭐ Muy Fácil | $20-50 | Startups, equipos pequeños |
| **Railway** | ⭐ Muy Fácil | $20-40 | Desarrollo rápido |
| **Google Cloud Run** | ⭐⭐ Fácil | $30-100 | Empresas que ya usan GCP |
| **AWS (ECS/Fargate)** | ⭐⭐⭐ Medio | $50-150 | Empresas grandes |
| **VPS (DigitalOcean)** | ⭐⭐⭐ Medio | $20-50 | Control total |

---

## 3. Opción Recomendada: Google Cloud Run

Ya que tu empresa usa Google Cloud, esta es la mejor opción. Cloud Run es:
- **Serverless**: No administras servidores
- **Escalable**: Se adapta al tráfico automáticamente
- **Económico**: Pagas solo por uso
- **Integrado**: Funciona con otros servicios de GCP

### Paso a Paso: Deploy a Google Cloud Run

#### 3.1 Preparar el Proyecto

Crear archivo `Dockerfile` en la raíz del proyecto (`launchpro-app/launchpro-app/`):

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Instalar dependencias necesarias
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Instalar dependencias
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build de la aplicación
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar Prisma Client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Imagen de producción
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Crear usuario no-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos necesarios
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

Modificar `next.config.js` para standalone output:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // ... resto de tu configuración
}

module.exports = nextConfig
```

#### 3.2 Configurar Google Cloud

```bash
# 1. Instalar Google Cloud CLI
# Mac:
brew install google-cloud-sdk

# 2. Iniciar sesión
gcloud auth login

# 3. Configurar proyecto
gcloud config set project TU_PROJECT_ID

# 4. Habilitar servicios necesarios
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
```

#### 3.3 Crear Base de Datos en Cloud SQL

```bash
# Crear instancia de PostgreSQL
gcloud sql instances create launchpro-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Crear base de datos
gcloud sql databases create launchpro --instance=launchpro-db

# Crear usuario
gcloud sql users create launchpro_user \
  --instance=launchpro-db \
  --password=TU_PASSWORD_SEGURO
```

#### 3.4 Deploy a Cloud Run

```bash
# Desde la carpeta del proyecto (donde está el Dockerfile)
cd launchpro-app/launchpro-app

# Build y deploy en un solo comando
gcloud run deploy launchpro \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=postgresql://launchpro_user:PASSWORD@/launchpro?host=/cloudsql/PROJECT:us-central1:launchpro-db" \
  --set-env-vars "NEXTAUTH_SECRET=tu-secret" \
  --set-env-vars "META_ACCESS_TOKEN=..." \
  --add-cloudsql-instances PROJECT:us-central1:launchpro-db
```

#### 3.5 Ejecutar Migraciones en Producción

```bash
# Conectar a Cloud SQL y ejecutar migraciones
gcloud sql connect launchpro-db --user=launchpro_user

# O usando Cloud Run Jobs para migraciones
gcloud run jobs create migrate-db \
  --image gcr.io/TU_PROJECT/launchpro \
  --command "npx" \
  --args "prisma,migrate,deploy" \
  --set-cloudsql-instances PROJECT:us-central1:launchpro-db \
  --set-env-vars "DATABASE_URL=..."
```

#### 3.6 Configurar Dominio Personalizado (Opcional)

```bash
# En Cloud Run Console > Tu servicio > Manage Custom Domains
# O via CLI:
gcloud run domain-mappings create \
  --service launchpro \
  --domain launchpro.tuempresa.com \
  --region us-central1
```

---

## 4. Otras Opciones de Hosting

### Opción A: Vercel (La Más Fácil)

**Pros**: Deploy automático con git push, SSL gratis, preview deployments
**Contras**: Base de datos separada, puede ser más caro a escala

```bash
# 1. Instalar Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy
cd launchpro-app/launchpro-app
vercel

# 4. Configurar variables de entorno en vercel.com/dashboard
```

Para base de datos con Vercel, usar:
- **Vercel Postgres** ($20/mes)
- **Supabase** (gratis hasta cierto límite)
- **Neon** (gratis tier generoso)

### Opción B: Railway (Muy Fácil, Todo Incluido)

**Pros**: DB + App en un lugar, interfaz simple, gratis para empezar
**Contras**: Menos control que GCP

```bash
# 1. Ir a railway.app y conectar GitHub
# 2. Crear nuevo proyecto desde repo
# 3. Añadir PostgreSQL desde el marketplace
# 4. Configurar variables de entorno
# 5. Deploy automático!
```

### Opción C: DigitalOcean App Platform

**Pros**: Buen balance precio/facilidad
**Contras**: Menos integración que Vercel

```bash
# Similar a Vercel - conectar GitHub y deploy
# Base de datos: DigitalOcean Managed PostgreSQL ($15/mes)
```

---

## 5. Comparativa de Costos

### Escenario: Equipo pequeño (3-5 usuarios, uso moderado)

| Servicio | App | Base de Datos | Total/mes |
|----------|-----|---------------|-----------|
| **Vercel + Supabase** | $20 | $0-25 | $20-45 |
| **Railway** | $5-20 | $5-15 | $10-35 |
| **Google Cloud Run + SQL** | $10-30 | $15-40 | $25-70 |
| **DigitalOcean** | $12 | $15 | $27 |

### Recomendación Final

**Para tu caso específico (empresa usa GCP):**

1. **Corto plazo**: Usa **Google Cloud Run** + **Cloud SQL**
   - Se integra con lo que ya tienen
   - Escalable si crece
   - Costo inicial: ~$30-50/mes

2. **Si quieres algo más simple para empezar**: Usa **Railway**
   - Deploy en 10 minutos
   - Todo incluido
   - Migrar a GCP después es fácil

---

## Checklist de Producción

- [ ] Configurar variables de entorno en el hosting
- [ ] Configurar base de datos PostgreSQL
- [ ] Ejecutar migraciones (`npx prisma migrate deploy`)
- [ ] Configurar dominio y SSL
- [ ] Configurar backups de base de datos
- [ ] Configurar monitoreo/logs
- [ ] Probar todas las funcionalidades
- [ ] Configurar acceso para usuarios (si es necesario login)

---

## Comandos de Referencia Rápida

```bash
# Desarrollo local
npm run dev

# Build de producción
npm run build

# Iniciar en producción
npm start

# Migraciones
npx prisma migrate deploy      # Producción
npx prisma migrate dev         # Desarrollo

# Ver logs en Cloud Run
gcloud run services logs read launchpro --region us-central1

# Ver estado del servicio
gcloud run services describe launchpro --region us-central1
```

---

## ¿Necesitas Ayuda?

Si tienes dudas durante el proceso:
1. Revisa los logs del servicio
2. Verifica que las variables de entorno estén correctas
3. Asegúrate de que la base de datos sea accesible desde el hosting

El proceso más largo es la primera vez. Después, los deploys son automáticos con cada `git push`.
