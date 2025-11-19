# 🪟 LaunchPro - Guía de Instalación Definitiva para Windows

## 📋 Tabla de Contenidos

1. [Prerrequisitos](#prerrequisitos)
2. [Instalación de Herramientas](#instalación-de-herramientas)
3. [Configuración de Google Cloud](#configuración-de-google-cloud)
4. [Configuración de APIs](#configuración-de-apis)
5. [Instalación del Proyecto](#instalación-del-proyecto)
6. [Configuración de Base de Datos](#configuración-de-base-de-datos)
7. [Variables de Entorno](#variables-de-entorno)
8. [Ejecución de la Aplicación](#ejecución-de-la-aplicación)
9. [Verificación](#verificación)
10. [Troubleshooting Windows](#troubleshooting-windows)

---

## 1. Prerrequisitos

### ✅ Checklist Antes de Empezar

- [ ] Windows 10 o superior (64-bit)
- [ ] Conexión a Internet estable
- [ ] Permisos de administrador
- [ ] Al menos 5 GB de espacio libre
- [ ] Cuenta de GitHub (para clonar el repo)

---

## 2. Instalación de Herramientas

### 📦 A. Node.js (v18 o superior)

#### Paso 1: Descargar Node.js

1. Ve a https://nodejs.org/
2. Descarga la versión **LTS (Long Term Support)**
3. Ejecuta el instalador `node-v18.x.x-x64.msi`

#### Paso 2: Instalar Node.js

1. Click en "Next" en todas las pantallas
2. ✅ **IMPORTANTE**: Marca la casilla "Automatically install the necessary tools"
3. Click en "Install"
4. Espera a que termine (puede tardar 5-10 minutos)

#### Paso 3: Verificar Instalación

Abre **PowerShell** (busca "PowerShell" en el menú inicio) y ejecuta:

```powershell
node --version
# Debe mostrar: v18.x.x o superior

npm --version
# Debe mostrar: 9.x.x o superior
```

✅ **Si vez los números de versión, Node.js está instalado correctamente!**

---

### 🐘 B. PostgreSQL (Base de Datos)

#### Opción 1: PostgreSQL Nativo (Recomendado para principiantes)

##### Paso 1: Descargar PostgreSQL

1. Ve a https://www.postgresql.org/download/windows/
2. Click en "Download the installer"
3. Descarga la versión **14.x** o superior (64-bit)

##### Paso 2: Instalar PostgreSQL

1. Ejecuta el instalador `postgresql-14.x-windows-x64.exe`
2. Click "Next" hasta llegar a "Select Components"
3. Asegúrate de que estén marcados:
   - ✅ PostgreSQL Server
   - ✅ pgAdmin 4 (herramienta visual)
   - ✅ Command Line Tools
4. Click "Next"
5. **IMPORTANTE**: Cuando pida la contraseña del superusuario:
   - Ingresa: `postgres` (o la que prefieras)
   - **¡APUNTA ESTA CONTRASEÑA!** La necesitarás después
6. Puerto: Deja el default `5432`
7. Locale: Default
8. Click "Next" e "Install"

##### Paso 3: Agregar PostgreSQL al PATH

1. Busca "Variables de entorno" en Windows
2. Click en "Variables de entorno"
3. En "Variables del sistema", busca "Path"
4. Click "Editar"
5. Click "Nuevo" y agrega: `C:\Program Files\PostgreSQL\14\bin`
6. Click "Aceptar" en todo

##### Paso 4: Verificar Instalación

Abre una **NUEVA ventana de PowerShell** (cierra la anterior) y ejecuta:

```powershell
psql --version
# Debe mostrar: psql (PostgreSQL) 14.x
```

#### Opción 2: Docker (Recomendado para usuarios avanzados)

##### Paso 1: Instalar Docker Desktop

1. Ve a https://www.docker.com/products/docker-desktop/
2. Descarga "Docker Desktop for Windows"
3. Ejecuta el instalador
4. Reinicia tu computadora cuando lo pida

##### Paso 2: Iniciar PostgreSQL en Docker

Abre PowerShell y ejecuta:

```powershell
docker run --name launchpro-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=launchpro `
  -p 5432:5432 `
  -d postgres:14
```

##### Paso 3: Verificar que está corriendo

```powershell
docker ps
# Debes ver launchpro-postgres en la lista
```

---

### 🔧 C. Git (Control de Versiones)

#### Paso 1: Descargar Git

1. Ve a https://git-scm.com/download/win
2. Descarga el instalador (64-bit)
3. Ejecuta `Git-2.x.x-64-bit.exe`

#### Paso 2: Instalar Git

1. Click "Next" en todas las opciones (las default están bien)
2. **IMPORTANTE**: En "Adjusting your PATH environment":
   - Selecciona: "Git from the command line and also from 3rd-party software"
3. En "Choosing the SSH executable":
   - Selecciona: "Use bundled OpenSSH"
4. Click "Install"

#### Paso 3: Configurar Git

Abre PowerShell y ejecuta:

```powershell
git config --global user.name "Tu Nombre"
git config --global user.email "tu@email.com"

# Verificar
git --version
# Debe mostrar: git version 2.x.x
```

---

### ☁️ D. Google Cloud SDK (para Vertex AI)

#### Paso 1: Descargar Cloud SDK

1. Ve a https://cloud.google.com/sdk/docs/install
2. Click en "Windows" en la sección de instalación
3. Descarga el instalador: `GoogleCloudSDKInstaller.exe`

#### Paso 2: Instalar Cloud SDK

1. Ejecuta el instalador
2. Marca todas las opciones:
   - ✅ Install bundled Python
   - ✅ Run 'gcloud init' after installation
3. Click "Install"

#### Paso 3: Configurar gcloud

Cuando termine la instalación, se abrirá una ventana de terminal:

```powershell
# Iniciar sesión
gcloud auth login
# Se abrirá tu navegador, inicia sesión con tu cuenta de Google

# Configurar proyecto
gcloud config set project TU-PROJECT-ID

# Autenticar para desarrollo local
gcloud auth application-default login
```

#### Paso 4: Verificar Instalación

```powershell
gcloud --version
# Debe mostrar: Google Cloud SDK xxx.x.x
```

---

### 📝 E. Editor de Código (Opcional pero Recomendado)

#### Visual Studio Code

1. Ve a https://code.visualstudio.com/
2. Descarga e instala
3. Instala estas extensiones (opcional):
   - Prisma
   - ESLint
   - Prettier
   - TypeScript and JavaScript Language Features

---

## 3. Configuración de Google Cloud

### 🔑 A. Crear Proyecto en Google Cloud

#### Paso 1: Acceder a Console

1. Ve a https://console.cloud.google.com/
2. Inicia sesión con tu cuenta de Google
3. Click en "Select a project" → "New Project"

#### Paso 2: Crear Proyecto

1. Nombre del proyecto: `launchpro-production` (o el que prefieras)
2. Click "Create"
3. **¡APUNTA EL PROJECT ID!** Lo necesitarás después

### 🤖 B. Habilitar APIs

En la consola de Google Cloud, ve al menú hamburguesa (☰) y:

#### 1. Habilitar Vertex AI API

```
APIs & Services → Library → Busca "Vertex AI API" → Enable
```

#### 2. Habilitar Cloud Storage API

```
APIs & Services → Library → Busca "Cloud Storage API" → Enable
```

### 🔐 C. Crear Service Account

#### Paso 1: Crear Cuenta de Servicio

1. Ve a: `IAM & Admin` → `Service Accounts`
2. Click "Create Service Account"
3. Nombre: `launchpro-service`
4. Description: `Service account for LaunchPro AI operations`
5. Click "Create and Continue"

#### Paso 2: Asignar Roles

Agrega estos roles:

- ✅ `Vertex AI User`
- ✅ `Storage Object Admin`

Click "Continue" → "Done"

#### Paso 3: Crear Llave JSON

1. Click en la service account que acabas de crear
2. Ve a la pestaña "Keys"
3. Click "Add Key" → "Create new key"
4. Selecciona "JSON"
5. Click "Create"
6. **¡GUARDA EL ARCHIVO!** Se descargará como `launchpro-xxxxx.json`
7. **Renómbralo a**: `gcp-service-account.json`

### 🪣 D. Crear Cloud Storage Bucket

#### Opción 1: Desde la Consola Web

1. Ve a: `Cloud Storage` → `Buckets`
2. Click "Create Bucket"
3. Nombre: `launchpro-media-[tu-nombre]` (debe ser único globalmente)
4. Location: `us-central1` (Region)
5. Storage class: `Standard`
6. Access control: `Fine-grained`
7. Click "Create"

#### Opción 2: Desde PowerShell

```powershell
gsutil mb -p TU-PROJECT-ID -l us-central1 gs://launchpro-media-[tu-nombre]
```

**¡APUNTA EL NOMBRE DEL BUCKET!** Lo necesitarás en el .env

---

## 4. Configuración de APIs

### 🎯 A. Tonic API

#### Ya tienes las credenciales:

**Tonic TikTok**:
- Consumer Key: `805310f600a835c721a40f06539174a7953a97c9abff3b1d759c10e9fb5c308a`
- Consumer Secret: `66ae4d352dd61deec690a98c7914d1dc59fc76a2d132338e61f4ac2b57bed98a`

**Tonic Meta**:
- Consumer Key: `e9866aee9d040f1e983ecdfb2b83a0a394766ad266f59cd335ea44409abfa943`
- Consumer Secret: `270bcd9d4b40eacb9c19cf7e0c4b96228b67427c18a86a6f12ffebbe6986dc8b`

✅ **No necesitas hacer nada más**, ya están configuradas en el seed.

---

### 📘 B. Meta Ads API

#### Ya tienes las credenciales:

- App ID: `1335292061146086`
- App Secret: `40f2e75146149b8eed8f1485824e2d11`
- Access Token: `EAASZBcOj52ZBYBPCOdF9TaIBXAFLjIJSkFJIUi0lDVsZCylYZB5b723r5sk9KzOU8aTJ81Us2f8PZCz9LnZA58VoVf3zpFsaoVEKBzdZAZB5bCZC7SmMvZBU1GzZB9MG5zOC42c6Gw5APZBXy338uaxWvFMAzzZASDoZBCMnqMMTZC6G9U7JWwxCe7ObNBr9iCf41aI`

**Verificación (Opcional)**:

Para verificar que el token funciona:

```powershell
curl "https://graph.facebook.com/v21.0/me?access_token=TU_ACCESS_TOKEN"
```

---

### 🎵 C. TikTok Ads API

#### Ya tienes las credenciales:

- Access Token: `9f175d1fa83d0d85ba18ace5e84c42fc89934f01`
- Advertiser IDs: Ya están en el seed

✅ **Ya configurado en el seed.**

---

### 🤖 D. Anthropic API (Claude)

#### Paso 1: Crear Cuenta

1. Ve a https://console.anthropic.com/
2. Crea una cuenta o inicia sesión

#### Paso 2: Obtener API Key

1. Ve a "API Keys" en el menú
2. Click "Create Key"
3. Nombre: `LaunchPro Production`
4. Click "Create"
5. **¡COPIA LA KEY AHORA!** No podrás verla después
6. Debe verse así: `sk-ant-api03-xxxxxxxxxxxxxxxx`

**¡APUNTA ESTA KEY!** La necesitarás en el .env

---

## 5. Instalación del Proyecto

### 📂 A. Clonar el Repositorio

#### Paso 1: Navegar a tu carpeta de proyectos

Abre PowerShell y ejecuta:

```powershell
# Crear carpeta para proyectos (si no existe)
mkdir C:\Proyectos
cd C:\Proyectos
```

#### Paso 2: Clonar el repositorio

```powershell
git clone https://github.com/Rjvasquez0414/LaunchPro.git
cd LaunchPro\launchpro-app\launchpro-app
```

---

### 📦 B. Instalar Dependencias de Node.js

```powershell
# Esto puede tardar 2-5 minutos
npm install
```

Si ves **warnings** (advertencias) en amarillo, está bien. Solo preocúpate si ves **ERRORS** en rojo.

---

## 6. Configuración de Base de Datos

### 🗄️ A. Crear Base de Datos

#### Opción 1: PostgreSQL Nativo

```powershell
# Conectar a PostgreSQL
psql -U postgres

# En el prompt de PostgreSQL (postgres=#), ejecuta:
CREATE DATABASE launchpro;

# Salir
\q
```

#### Opción 2: Docker

```powershell
# Ya se creó al iniciar el container
# Verificar que existe:
docker exec -it launchpro-postgres psql -U postgres -c "\l"
```

### 🔄 B. Aplicar Schema Multi-Cuenta

```powershell
# Asegúrate de estar en la carpeta correcta
cd C:\Proyectos\LaunchPro\launchpro-app\launchpro-app

# Navegar a la carpeta padre
cd ..

# Copiar el schema multi-cuenta
copy prisma\schema-multi-account.prisma prisma\schema.prisma

# Volver a la carpeta del proyecto
cd launchpro-app
```

---

## 7. Variables de Entorno

### 📝 A. Crear Archivo .env

#### Paso 1: Copiar el template

```powershell
copy ..\.env.example .env
```

#### Paso 2: Editar el archivo .env

Abre el archivo `.env` con tu editor favorito (Notepad++, VS Code, o incluso Notepad):

```powershell
notepad .env
```

#### Paso 3: Rellenar las Variables

Reemplaza **TODOS** los valores de ejemplo con tus credenciales reales:

```env
# ============================================
# DATABASE
# ============================================
# Opción 1: PostgreSQL Nativo
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/launchpro?schema=public"

# Opción 2: Docker
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/launchpro?schema=public"

# ============================================
# TONIC API (No cambiar - ya está en el seed)
# ============================================
TONIC_API_BASE_URL=https://api.publisher.tonic.com

# ============================================
# META ADS (No cambiar - ya está en el seed)
# ============================================
META_API_VERSION=v21.0

# ============================================
# ANTHROPIC API
# ============================================
ANTHROPIC_API_KEY=sk-ant-api03-TU_KEY_AQUI

# ============================================
# GOOGLE CLOUD PLATFORM
# ============================================
GCP_PROJECT_ID=tu-project-id-aqui
GCP_LOCATION=us-central1
GCP_STORAGE_BUCKET=launchpro-media-tu-nombre
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json

# ============================================
# APPLICATION
# ============================================
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================
# AI FEATURES
# ============================================
ENABLE_AI_CONTENT_GENERATION=true
ENABLE_IMAGE_GENERATION=true
ENABLE_VIDEO_GENERATION=true
```

**✅ CHECKLIST DE VARIABLES QUE DEBES CAMBIAR:**

- [ ] `DATABASE_URL` - Tu contraseña de PostgreSQL
- [ ] `ANTHROPIC_API_KEY` - Tu API key de Claude
- [ ] `GCP_PROJECT_ID` - Tu project ID de Google Cloud
- [ ] `GCP_STORAGE_BUCKET` - El nombre de tu bucket
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` - Debe apuntar a tu archivo JSON

#### Paso 4: Copiar Service Account JSON

Copia el archivo `gcp-service-account.json` que descargaste de Google Cloud a la carpeta del proyecto:

```powershell
# Desde tu carpeta de descargas
copy C:\Users\TuUsuario\Downloads\launchpro-xxxxx.json C:\Proyectos\LaunchPro\launchpro-app\launchpro-app\gcp-service-account.json
```

---

## 8. Ejecución de la Aplicación

### 🚀 A. Generar Prisma Client

```powershell
npm run prisma:generate
```

Debes ver: `✔ Generated Prisma Client`

### 🗃️ B. Ejecutar Migraciones

```powershell
npm run prisma:migrate
```

Cuando te pida un nombre para la migración, escribe:

```
multi-account-support
```

Debes ver: `✓ Database synced with schema`

### 🌱 C. Poblar la Base de Datos (Seed)

```powershell
npm run db:seed
```

Debes ver:
```
🌱 Seeding database...
📝 Creating global settings...
🎯 Creating Tonic accounts...
📘 Creating Meta accounts...
🎵 Creating TikTok accounts...
✅ Database seeded successfully!
```

### ▶️ D. Iniciar el Servidor de Desarrollo

```powershell
npm run dev
```

Debes ver:
```
▲ Next.js 15.1.0
- Local:        http://localhost:3000
- Ready in 2.5s
```

---

## 9. Verificación

### ✅ A. Verificar que Todo Funciona

#### 1. Abrir en el Navegador

Abre tu navegador y ve a: http://localhost:3000

Debes ver la **página de inicio de LaunchPro** 🚀

#### 2. Verificar API Health

En otra ventana de PowerShell:

```powershell
curl http://localhost:3000/api/health
```

Debe responder:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-12T...",
  "services": {
    "database": "connected",
    "api": "operational"
  }
}
```

#### 3. Verificar Cuentas

```powershell
curl http://localhost:3000/api/accounts
```

Debes ver las 21 cuentas (2 Tonic, 14 Meta, 5 TikTok)

#### 4. Verificar Base de Datos con Prisma Studio

En una nueva ventana de PowerShell:

```powershell
npm run prisma:studio
```

Se abrirá en tu navegador: http://localhost:5555

Navega a la tabla `Account` y verifica que hay **21 registros**.

---

## 10. Troubleshooting Windows

### ❌ Problema: "psql no se reconoce como comando"

**Solución**:

1. Busca "Variables de entorno" en Windows
2. Edita "Path" en Variables del Sistema
3. Agrega: `C:\Program Files\PostgreSQL\14\bin`
4. **Cierra y abre NUEVA ventana de PowerShell**

---

### ❌ Problema: "Cannot find module 'prisma'"

**Solución**:

```powershell
npm install
npm run prisma:generate
```

---

### ❌ Problema: "ECONNREFUSED" al conectar a PostgreSQL

**Solución 1: PostgreSQL no está corriendo**

```powershell
# Verificar servicios de Windows
services.msc
# Busca "postgresql-x64-14" y asegúrate que esté "Running"
```

**Solución 2: PASSWORD incorrecto en .env**

```powershell
# Verifica la contraseña que pusiste al instalar PostgreSQL
# Debe coincidir con la de DATABASE_URL en .env
```

**Solución 3: PostgreSQL en Docker no está corriendo**

```powershell
docker ps
# Si no ves launchpro-postgres, reinícialo:
docker start launchpro-postgres
```

---

### ❌ Problema: "Port 3000 already in use"

**Solución**:

```powershell
# Opción 1: Matar el proceso que usa el puerto 3000
netstat -ano | findstr :3000
# Apunta el PID (última columna)
taskkill /PID [el_numero_del_PID] /F

# Opción 2: Usar otro puerto
$env:PORT=3001
npm run dev
```

---

### ❌ Problema: Error con Google Cloud Service Account

**Solución**:

```powershell
# Verificar que el archivo existe
Test-Path .\gcp-service-account.json
# Debe devolver: True

# Verificar que GOOGLE_APPLICATION_CREDENTIALS apunta correctamente
# En .env debe ser:
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json

# Si sigue fallando, usar ruta absoluta:
GOOGLE_APPLICATION_CREDENTIALS=C:\Proyectos\LaunchPro\launchpro-app\launchpro-app\gcp-service-account.json
```

---

### ❌ Problema: "MODULE_NOT_FOUND" con form-data

**Solución**:

```powershell
npm install form-data
npm run prisma:generate
```

---

### ❌ Problema: Errores con caracteres especiales en PowerShell

**Solución**:

```powershell
# Usar comillas simples en vez de dobles para URLs:
curl 'http://localhost:3000/api/health'

# O usar Invoke-WebRequest (comando nativo de PowerShell):
Invoke-WebRequest -Uri http://localhost:3000/api/health
```

---

### ❌ Problema: "certificate verify failed" con npm install

**Solución**:

```powershell
# Opción 1: Actualizar certificados
npm config set strict-ssl false
npm install
npm config set strict-ssl true

# Opción 2: Usar VPN/Red diferente
```

---

### ❌ Problema: Prisma genera archivos en carpeta incorrecta

**Solución**:

```powershell
# Asegúrate de estar en la carpeta correcta
cd C:\Proyectos\LaunchPro\launchpro-app\launchpro-app

# Eliminar node_modules y reinstalar
Remove-Item -Recurse -Force node_modules
npm install
npm run prisma:generate
```

---

## 🎉 ¡Listo!

Si llegaste hasta aquí y todo funciona, **¡FELICIDADES!** 🎊

Tu instalación de LaunchPro está completa y lista para lanzar campañas.

### 🚀 Próximos Pasos:

1. **Crear tu primera campaña**:
   - Ve a http://localhost:3000
   - Click en "Create New Campaign"
   - Sigue el wizard de 3 pasos

2. **Explorar la base de datos**:
   ```powershell
   npm run prisma:studio
   ```

3. **Ver logs en tiempo real**:
   - Los logs aparecen en la consola de PowerShell donde ejecutaste `npm run dev`

4. **Detener el servidor**:
   - Presiona `Ctrl + C` en la ventana de PowerShell

5. **Reiniciar el servidor**:
   ```powershell
   npm run dev
   ```

---

## 📚 Recursos Adicionales

- **Documentación completa**: Ver `README.md`
- **Guía rápida**: Ver `QUICK_START.md`
- **Multi-cuentas**: Ver `MULTI_ACCOUNT_SETUP.md`
- **Contribuir**: Ver `CONTRIBUTING.md`

---

## 🆘 ¿Necesitas Ayuda?

Si tienes problemas que no están en el Troubleshooting:

1. Revisa los logs en la consola
2. Verifica que todas las variables de entorno estén correctas
3. Asegúrate de que PostgreSQL esté corriendo
4. Verifica que todos los puertos estén disponibles (3000, 5432, 5555)

---

## 🎓 Comandos Útiles de PowerShell

```powershell
# Ver procesos que usan un puerto
netstat -ano | findstr :3000

# Limpiar caché de npm
npm cache clean --force

# Ver versiones instaladas
node --version
npm --version
git --version
psql --version

# Reiniciar PostgreSQL (si está instalado como servicio)
Restart-Service postgresql-x64-14

# Ver logs de Docker
docker logs launchpro-postgres

# Acceder a PostgreSQL en Docker
docker exec -it launchpro-postgres psql -U postgres -d launchpro
```

---

**Creado con ❤️ para facilitar el setup en Windows**

**Versión**: 1.0.0
**Última actualización**: Noviembre 2025
**Compatibilidad**: Windows 10/11 (64-bit)
