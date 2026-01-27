#!/bin/bash
# ============================================================================
# LaunchPro - Setup Secrets for Cloud Run
# ============================================================================
# Este script crea los secrets en Google Cloud Secret Manager
# y los configura para Cloud Run.
#
# USO:
# 1. Edita las variables abajo con tus valores reales
# 2. Ejecuta: bash setup-secrets.sh
# ============================================================================

# Configuración del proyecto
PROJECT_ID="launchpro-v2"
REGION="us-central1"
SERVICE_NAME="launchpro-app"

# ============================================================================
# CONFIGURA TUS SECRETS AQUÍ
# ============================================================================

# Database (Supabase)
DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"

# Meta Ads
META_ACCESS_TOKEN="your-meta-access-token"
META_AD_ACCOUNT_ID="act_XXXXXXXXXX"
META_APP_ID="your-app-id"
META_APP_SECRET="your-app-secret"

# TikTok Ads
TIKTOK_ACCESS_TOKEN="your-tiktok-access-token"
TIKTOK_ADVERTISER_ID="your-advertiser-id"

# AI Services
GEMINI_API_KEY="your-gemini-api-key"

# GCP (usar el mismo proyecto o tu proyecto existente)
GCP_PROJECT_ID="launchpro-v2"
GCP_STORAGE_BUCKET="launchpro-media"
GCP_LOCATION="us-central1"

# DesignFlow (opcional)
DESIGNFLOW_SUPABASE_URL=""
DESIGNFLOW_SUPABASE_ANON_KEY=""

# ============================================================================
# Crear secrets
# ============================================================================

echo "Creating secrets in Secret Manager..."

create_secret() {
    local name=$1
    local value=$2

    if [ -z "$value" ]; then
        echo "⚠️  Skipping $name (empty value)"
        return
    fi

    # Verificar si el secret ya existe
    if gcloud secrets describe $name --project=$PROJECT_ID 2>/dev/null; then
        echo "🔄 Updating secret: $name"
        echo -n "$value" | gcloud secrets versions add $name --data-file=- --project=$PROJECT_ID
    else
        echo "✅ Creating secret: $name"
        echo -n "$value" | gcloud secrets create $name --data-file=- --project=$PROJECT_ID
    fi
}

# Crear todos los secrets
create_secret "DATABASE_URL" "$DATABASE_URL"
create_secret "META_ACCESS_TOKEN" "$META_ACCESS_TOKEN"
create_secret "META_AD_ACCOUNT_ID" "$META_AD_ACCOUNT_ID"
create_secret "META_APP_ID" "$META_APP_ID"
create_secret "META_APP_SECRET" "$META_APP_SECRET"
create_secret "TIKTOK_ACCESS_TOKEN" "$TIKTOK_ACCESS_TOKEN"
create_secret "TIKTOK_ADVERTISER_ID" "$TIKTOK_ADVERTISER_ID"
create_secret "GEMINI_API_KEY" "$GEMINI_API_KEY"
create_secret "DESIGNFLOW_SUPABASE_URL" "$DESIGNFLOW_SUPABASE_URL"
create_secret "DESIGNFLOW_SUPABASE_ANON_KEY" "$DESIGNFLOW_SUPABASE_ANON_KEY"

echo ""
echo "✅ Secrets created successfully!"
echo ""

# ============================================================================
# Actualizar Cloud Run con los secrets
# ============================================================================

echo "Updating Cloud Run service with secrets..."

CLOUD_RUN_URL="https://launchpro-app-860385736854.us-central1.run.app"

gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --project=$PROJECT_ID \
    --set-secrets=DATABASE_URL=DATABASE_URL:latest,META_ACCESS_TOKEN=META_ACCESS_TOKEN:latest,TIKTOK_ACCESS_TOKEN=TIKTOK_ACCESS_TOKEN:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest \
    --set-env-vars=NODE_ENV=production,GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_STORAGE_BUCKET=$GCP_STORAGE_BUCKET,GCP_LOCATION=$GCP_LOCATION,CLOUD_RUN_URL=$CLOUD_RUN_URL,CLOUD_TASKS_ENABLED=true,CLOUD_TASKS_LOCATION=us-central1

echo ""
echo "============================================"
echo "✅ Cloud Run service updated!"
echo "============================================"
echo "Service URL: $CLOUD_RUN_URL"
echo ""
echo "Verify the deployment:"
echo "  curl $CLOUD_RUN_URL/api/health"
echo ""
