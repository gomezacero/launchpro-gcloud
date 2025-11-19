# ✅ Windows Installation Quick Checklist

## Antes de Empezar
- [ ] Windows 10/11 (64-bit)
- [ ] Permisos de administrador
- [ ] 5 GB de espacio libre
- [ ] Conexión a Internet

---

## 1. Instalar Herramientas (30-40 min)

### Node.js
- [ ] Descargar de https://nodejs.org/ (LTS)
- [ ] Instalar
- [ ] Verificar: `node --version` y `npm --version`

### PostgreSQL
**Opción A: Nativo**
- [ ] Descargar de https://www.postgresql.org/download/windows/
- [ ] Instalar (¡apuntar contraseña!)
- [ ] Agregar `C:\Program Files\PostgreSQL\14\bin` al PATH
- [ ] Verificar: `psql --version`

**Opción B: Docker**
- [ ] Instalar Docker Desktop
- [ ] Ejecutar: `docker run --name launchpro-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14`

### Git
- [ ] Descargar de https://git-scm.com/download/win
- [ ] Instalar
- [ ] Configurar: `git config --global user.name "Tu Nombre"`
- [ ] Verificar: `git --version`

### Google Cloud SDK
- [ ] Descargar de https://cloud.google.com/sdk/docs/install
- [ ] Instalar
- [ ] Ejecutar: `gcloud auth login`
- [ ] Verificar: `gcloud --version`

---

## 2. Configurar Google Cloud (15-20 min)

### Crear Proyecto
- [ ] Ir a https://console.cloud.google.com/
- [ ] Crear nuevo proyecto: "launchpro-production"
- [ ] Apuntar el PROJECT_ID

### Habilitar APIs
- [ ] Vertex AI API
- [ ] Cloud Storage API

### Service Account
- [ ] Crear service account: "launchpro-service"
- [ ] Roles: `Vertex AI User` + `Storage Object Admin`
- [ ] Crear key JSON
- [ ] Descargar y renombrar a: `gcp-service-account.json`

### Cloud Storage
- [ ] Crear bucket: `launchpro-media-[tu-nombre]`
- [ ] Location: `us-central1`
- [ ] Apuntar el nombre del bucket

---

## 3. Obtener API Keys (10-15 min)

### Anthropic (Claude)
- [ ] Ir a https://console.anthropic.com/
- [ ] Crear API key
- [ ] Copiar key (empieza con `sk-ant-`)

### Verificar Credenciales Existentes
- [x] Tonic TikTok: Ya configurada
- [x] Tonic Meta: Ya configurada
- [x] Meta Ads: Ya configuradas
- [x] TikTok Ads: Ya configuradas

---

## 4. Clonar e Instalar Proyecto (5-10 min)

```powershell
# Clonar repositorio
cd C:\Proyectos
git clone https://github.com/Rjvasquez0414/LaunchPro.git
cd LaunchPro\launchpro-app\launchpro-app

# Instalar dependencias
npm install
```

- [ ] Repositorio clonado
- [ ] Dependencias instaladas sin errores

---

## 5. Crear Base de Datos (2 min)

```powershell
# PostgreSQL Nativo
psql -U postgres
CREATE DATABASE launchpro;
\q

# Docker (ya está creada)
```

- [ ] Base de datos `launchpro` creada

---

## 6. Configurar Variables de Entorno (10 min)

```powershell
# Copiar template
cd ..
copy .env.example launchpro-app\.env
cd launchpro-app

# Copiar service account
copy C:\Users\TuUsuario\Downloads\gcp-service-account.json .
```

### Editar .env con tus valores:
- [ ] `DATABASE_URL` (con tu password de PostgreSQL)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `GCP_PROJECT_ID`
- [ ] `GCP_STORAGE_BUCKET`
- [ ] `GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json`

---

## 7. Aplicar Schema y Seed (5 min)

```powershell
# Copiar schema multi-cuenta
cd ..
copy prisma\schema-multi-account.prisma prisma\schema.prisma
cd launchpro-app

# Generar Prisma client
npm run prisma:generate

# Crear migración
npm run prisma:migrate

# Poblar base de datos (21 cuentas)
npm run db:seed
```

- [ ] Prisma client generado
- [ ] Migración aplicada
- [ ] Seed completado (21 cuentas creadas)

---

## 8. Iniciar Aplicación (1 min)

```powershell
npm run dev
```

- [ ] Servidor corriendo en http://localhost:3000
- [ ] Sin errores en la consola

---

## 9. Verificar Instalación (5 min)

### En el navegador:
- [ ] http://localhost:3000 → Ver página de inicio
- [ ] http://localhost:3000/api/health → Ver `{"status":"healthy"}`

### En PowerShell:
```powershell
# Verificar cuentas
curl http://localhost:3000/api/accounts
```
- [ ] Ver 21 cuentas (2 Tonic, 14 Meta, 5 TikTok)

### Prisma Studio:
```powershell
npm run prisma:studio
```
- [ ] Abrir http://localhost:5555
- [ ] Ver tabla `Account` con 21 registros
- [ ] Ver tabla `GlobalSettings` con 1 registro

---

## 10. Crear Primera Campaña (5 min)

- [ ] Ir a http://localhost:3000
- [ ] Click "Create New Campaign"
- [ ] Completar Step 1: Partner Settings
- [ ] Completar Step 2: Campaign Settings
- [ ] Completar Step 3: Review & Launch
- [ ] Verificar que se crea la campaña

---

## ✅ Instalación Completa!

**Tiempo total estimado**: 1.5 - 2 horas

### Comandos útiles para el día a día:

```powershell
# Iniciar servidor
npm run dev

# Ver base de datos
npm run prisma:studio

# Ver logs de PostgreSQL (Docker)
docker logs launchpro-postgres

# Reiniciar base de datos (¡cuidado, borra todo!)
npm run prisma:reset
npm run db:seed
```

---

## 🆘 Problemas Comunes

| Problema | Solución Rápida |
|----------|-----------------|
| `psql` no reconocido | Agregar PostgreSQL al PATH |
| Puerto 3000 ocupado | `netstat -ano \| findstr :3000` → `taskkill /PID xxx /F` |
| Cannot connect to database | Verificar que PostgreSQL esté corriendo |
| Module not found | `npm install` |
| Prisma errors | `npm run prisma:generate` |

Ver **WINDOWS_INSTALLATION_GUIDE.md** para soluciones detalladas.

---

**¡Todo listo para lanzar campañas! 🚀**
