#!/bin/bash
# ============================================================================
# LaunchPro - Deploy Script
# ============================================================================
# Uso: ./deploy.sh [version] [mensaje]
# Ejemplo: ./deploy.sh v1.0.1 "fix: corregir bug en meta launcher"
# ============================================================================

set -e  # Salir si hay error

# Configuración
PROJECT_ID="launchpro-v2"
REGION="us-central1"
SERVICE_NAME="launchpro-app"
REPO="us-central1-docker.pkg.dev/launchpro-v2/launchpro-repo/launchpro-app"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Obtener versión
if [ -z "$1" ]; then
    # Auto-incrementar versión basada en tags de git
    LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
    VERSION=$(echo $LAST_TAG | awk -F. '{$NF = $NF + 1;} 1' | sed 's/ /./g')
    echo -e "${YELLOW}No se especificó versión. Usando: $VERSION${NC}"
else
    VERSION=$1
fi

# Mensaje de commit
if [ -z "$2" ]; then
    COMMIT_MSG="deploy: $VERSION"
else
    COMMIT_MSG="$2"
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   LaunchPro Deploy - $VERSION${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# 1. Verificar cambios
echo -e "${YELLOW}[1/6] Verificando cambios...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${GREEN}  ✓ Cambios detectados${NC}"
    git status -s
else
    echo -e "${YELLOW}  ⚠ No hay cambios para commitear${NC}"
fi
echo ""

# 2. Commit y push
echo -e "${YELLOW}[2/6] Commit y push...${NC}"
git add .
git commit -m "$COMMIT_MSG" || echo "  (sin cambios nuevos)"
git tag -a "$VERSION" -m "Release $VERSION" 2>/dev/null || echo "  (tag ya existe)"
git push gcloud main --tags || git push gcloud main
echo -e "${GREEN}  ✓ Código subido${NC}"
echo ""

# 3. Build Docker
echo -e "${YELLOW}[3/6] Building Docker image...${NC}"
docker build -t $REPO:$VERSION -t $REPO:latest .
echo -e "${GREEN}  ✓ Imagen construida${NC}"
echo ""

# 4. Push a Artifact Registry
echo -e "${YELLOW}[4/6] Pushing imagen a Artifact Registry...${NC}"
docker push $REPO:$VERSION
docker push $REPO:latest
echo -e "${GREEN}  ✓ Imagen subida${NC}"
echo ""

# 5. Deploy a Cloud Run
echo -e "${YELLOW}[5/6] Deploying a Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image=$REPO:$VERSION \
    --region=$REGION \
    --project=$PROJECT_ID \
    --quiet
echo -e "${GREEN}  ✓ Desplegado${NC}"
echo ""

# 6. Verificar health
echo -e "${YELLOW}[6/6] Verificando health...${NC}"
sleep 5
HEALTH=$(curl -s https://launchpro-app-860385736854.us-central1.run.app/api/health)
if echo "$HEALTH" | grep -q '"status":"healthy"'; then
    echo -e "${GREEN}  ✓ Servicio healthy${NC}"
else
    echo -e "${RED}  ✗ Servicio no responde correctamente${NC}"
    echo "  Response: $HEALTH"
fi
echo ""

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}   Deploy completado: $VERSION${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "URL: https://launchpro-app-860385736854.us-central1.run.app"
echo ""
