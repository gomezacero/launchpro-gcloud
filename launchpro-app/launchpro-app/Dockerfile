# ============================================================================
# LaunchPro - Dockerfile para Google Cloud Run
# ============================================================================
# Multi-stage build para optimizar el tamaño de la imagen

FROM node:20-alpine AS base

# Instalar dependencias del sistema necesarias para sharp y otros paquetes nativos
RUN apk add --no-cache libc6-compat

# ============================================================================
# Stage 1: Instalar dependencias
# ============================================================================
FROM base AS deps
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instalar todas las dependencias (incluyendo devDependencies para build)
RUN npm ci

# ============================================================================
# Stage 2: Build de la aplicación
# ============================================================================
FROM base AS builder
WORKDIR /app

# Copiar node_modules del stage anterior
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar cliente Prisma
RUN npx prisma generate

# Variables de entorno necesarias para el build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build de Next.js
RUN npm run build

# ============================================================================
# Stage 3: Imagen de producción
# ============================================================================
FROM base AS runner
WORKDIR /app

# Configuración de entorno
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar archivos públicos
COPY --from=builder /app/public ./public

# Configurar permisos para la cache de Next.js
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copiar el build standalone (optimizado para serverless)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copiar schema de Prisma (necesario para runtime)
COPY --from=builder /app/prisma ./prisma

# Copiar archivos necesarios para el runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Cambiar al usuario no-root
USER nextjs

# Exponer puerto para Cloud Run
EXPOSE 8080

# Comando de inicio
CMD ["node", "server.js"]
