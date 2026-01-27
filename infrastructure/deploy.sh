#!/bin/bash
# ============================================================================
# LaunchPro - GCP Infrastructure Deployment Script
# ============================================================================
#
# Este script despliega toda la infraestructura necesaria en Google Cloud:
# - Secret Manager secrets
# - Cloud Tasks queues
# - Cloud Scheduler jobs
# - Cloud Run service
#
# Requisitos:
# - gcloud CLI instalado y configurado
# - Permisos de administrador en el proyecto GCP
# - Archivo .env con las variables de entorno
#
# Uso:
#   ./deploy.sh [PROJECT_ID] [REGION]
#
# Ejemplo:
#   ./deploy.sh my-project-id us-central1

set -e  # Exit on error

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ID="${1:-$(gcloud config get-value project)}"
REGION="${2:-us-central1}"
SERVICE_NAME="launchpro-v2"
SERVICE_ACCOUNT="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}LaunchPro GCP Infrastructure Deployment${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# ============================================================================
# Verify Prerequisites
# ============================================================================

echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 &> /dev/null; then
    echo -e "${RED}Error: Not logged in to gcloud. Run 'gcloud auth login' first.${NC}"
    exit 1
fi

# Set project
gcloud config set project "$PROJECT_ID"

echo -e "${GREEN}Prerequisites OK${NC}"
echo ""

# ============================================================================
# Enable APIs
# ============================================================================

echo -e "${YELLOW}Enabling required APIs...${NC}"

APIS=(
    "run.googleapis.com"
    "cloudtasks.googleapis.com"
    "cloudscheduler.googleapis.com"
    "secretmanager.googleapis.com"
    "cloudbuild.googleapis.com"
    "artifactregistry.googleapis.com"
    "aiplatform.googleapis.com"
)

for api in "${APIS[@]}"; do
    echo "  Enabling $api..."
    gcloud services enable "$api" --quiet
done

echo -e "${GREEN}APIs enabled${NC}"
echo ""

# ============================================================================
# Create Service Account
# ============================================================================

echo -e "${YELLOW}Setting up service account...${NC}"

# Create service account if it doesn't exist
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" &> /dev/null; then
    echo "  Creating service account..."
    gcloud iam service-accounts create "$SERVICE_NAME" \
        --display-name="LaunchPro V2 Service Account" \
        --description="Service account for LaunchPro V2 Cloud Run service"
fi

# Grant necessary roles
ROLES=(
    "roles/run.invoker"
    "roles/cloudtasks.enqueuer"
    "roles/cloudtasks.taskRunner"
    "roles/secretmanager.secretAccessor"
    "roles/storage.objectAdmin"
    "roles/aiplatform.user"
)

for role in "${ROLES[@]}"; do
    echo "  Granting $role..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="$role" \
        --quiet
done

echo -e "${GREEN}Service account configured${NC}"
echo ""

# ============================================================================
# Create Cloud Tasks Queues
# ============================================================================

echo -e "${YELLOW}Creating Cloud Tasks queues...${NC}"

QUEUES=(
    "campaign-article-checks"
    "campaign-tracking-polls"
    "campaign-processing"
)

for queue in "${QUEUES[@]}"; do
    echo "  Creating queue: $queue..."

    # Delete if exists (to update config)
    gcloud tasks queues delete "$queue" --location="$REGION" --quiet 2>/dev/null || true

    # Create with appropriate config based on queue type
    case $queue in
        "campaign-article-checks")
            gcloud tasks queues create "$queue" \
                --location="$REGION" \
                --max-dispatches-per-second=10 \
                --max-concurrent-dispatches=100 \
                --max-attempts=5 \
                --min-backoff=60s \
                --max-backoff=300s
            ;;
        "campaign-tracking-polls")
            gcloud tasks queues create "$queue" \
                --location="$REGION" \
                --max-dispatches-per-second=20 \
                --max-concurrent-dispatches=200 \
                --max-attempts=10 \
                --min-backoff=30s \
                --max-backoff=120s
            ;;
        "campaign-processing")
            gcloud tasks queues create "$queue" \
                --location="$REGION" \
                --max-dispatches-per-second=5 \
                --max-concurrent-dispatches=50 \
                --max-attempts=3 \
                --min-backoff=120s \
                --max-backoff=600s
            ;;
    esac
done

echo -e "${GREEN}Cloud Tasks queues created${NC}"
echo ""

# ============================================================================
# Create Secrets
# ============================================================================

echo -e "${YELLOW}Setting up Secret Manager secrets...${NC}"
echo -e "${YELLOW}(You'll need to add the actual values later)${NC}"

SECRETS=(
    "DATABASE_URL"
    "DIRECT_URL"
    "NEXTAUTH_SECRET"
    "NEXTAUTH_URL"
    "GOOGLE_CLOUD_PROJECT_ID"
    "GCS_BUCKET_NAME"
    "GOOGLE_CLOUD_CREDENTIALS_JSON"
    "GEMINI_API_KEY"
    "META_ACCESS_TOKEN"
    "META_APP_ID"
    "META_APP_SECRET"
    "TONIC_API_URL"
    "TONIC_API_KEY"
    "TIKTOK_ACCESS_TOKEN"
    "TIKTOK_APP_ID"
    "TIKTOK_APP_SECRET"
)

for secret in "${SECRETS[@]}"; do
    if ! gcloud secrets describe "$secret" &> /dev/null 2>&1; then
        echo "  Creating secret: $secret..."
        gcloud secrets create "$secret" --replication-policy="automatic"

        # Grant access to service account
        gcloud secrets add-iam-policy-binding "$secret" \
            --member="serviceAccount:$SERVICE_ACCOUNT" \
            --role="roles/secretmanager.secretAccessor" \
            --quiet
    else
        echo "  Secret $secret already exists"
    fi
done

echo -e "${GREEN}Secrets configured${NC}"
echo ""

# ============================================================================
# Instructions for Manual Steps
# ============================================================================

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Infrastructure deployment complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Add secret values:"
echo "   For each secret, run:"
echo "   echo -n 'YOUR_VALUE' | gcloud secrets versions add SECRET_NAME --data-file=-"
echo ""
echo "2. Connect your repository to Cloud Build:"
echo "   - Go to Cloud Build > Triggers in the Console"
echo "   - Create a trigger for your repository"
echo "   - Point it to cloudbuild.yaml"
echo ""
echo "3. Deploy the application:"
echo "   cd launchpro-app"
echo "   gcloud builds submit"
echo ""
echo "4. Create Cloud Scheduler jobs (after Cloud Run is deployed):"
echo "   Update cloud-scheduler.yaml with actual CLOUD_RUN_URL"
echo "   Then create jobs manually or with additional script"
echo ""
echo -e "${GREEN}Service Account: $SERVICE_ACCOUNT${NC}"
echo -e "${GREEN}Cloud Run URL will be: https://${SERVICE_NAME}-xxxxx-${REGION:0:2}.a.run.app${NC}"
echo ""
