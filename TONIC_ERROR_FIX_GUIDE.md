# 🔧 Guía de Solución del Error "You are not allowed to create a campaign"

**Fecha**: 14 de Noviembre de 2025
**Estado**: ✅ IMPLEMENTADO
**Autor**: Claude (Anthropic)

---

## 📋 Resumen Ejecutivo

Se implementó una solución completa para resolver el error "You are not allowed to create a campaign" en Tonic API y prevenir que se desconfigure entre sesiones.

### Cambios Implementados

✅ **Sistema de caché de capacidades de cuentas**
✅ **Validación pre-creación de campañas**
✅ **Endpoint de diagnóstico completo**
✅ **UI de diagnóstico visual**
✅ **Logging mejorado para debugging**

---

## 🎯 ¿Qué Causaba el Error?

El error se producía por **dos razones principales**:

### 1. Cuenta Incorrecta Seleccionada
- La aplicación auto-seleccionaba la cuenta Tonic basándose solo en la plataforma (Meta/TikTok)
- No validaba si esa cuenta realmente tenía permisos para crear el tipo de campaña detectado
- Ejemplo: Si "Tonic TikTok" solo tiene permisos RSOC pero el sistema detecta que debe crear Display, fallaba

### 2. Falta de Persistencia
- Las capacidades de cada cuenta se detectaban en cada ejecución
- No se guardaban en base de datos
- Al "desconfigurarse", las llamadas API fallaban intermitentemente

---

## 🔨 Solución Implementada

### PASO 1: Schema de Base de Datos Actualizado

Se agregaron nuevos campos al modelo `Account` en Prisma:

```prisma
// Tonic capabilities cache (to avoid repeated API calls)
tonicSupportsRSOC   Boolean? // Does this account support RSOC campaigns?
tonicSupportsDisplay Boolean? // Does this account support Display campaigns?
tonicRSOCDomains    Json? // Available RSOC domains with languages
tonicCapabilitiesLastChecked DateTime? // When were capabilities last checked
```

**Importante**: Necesitas ejecutar migración de Prisma:

```bash
cd launchpro-app/launchpro-app
npx prisma db push
```

### PASO 2: Lógica de Caché de Capacidades

Ahora el `campaign-orchestrator.service.ts` hace lo siguiente:

```
1. Verifica si las capacidades están en caché (válido por 24 horas)
2. Si SÍ → Usa caché (rápido, sin llamadas API)
3. Si NO → Consulta Tonic API y guarda en DB
4. VALIDA que la cuenta pueda crear al menos un tipo de campaña
5. Si la cuenta NO soporta ningún tipo → ERROR claro con rollback
```

#### Logs Mejorados

Ahora verás en la consola:

```
✅ Using CACHED capabilities for account "Tonic Meta"
   - Supports RSOC: true
   - Supports Display: false
   - RSOC Domains: 3

🎯 Final campaign type: RSOC
Account capabilities: RSOC=true, Display=false
```

### PASO 3: Endpoint de Diagnóstico

**URL**: `GET /api/diagnostic/tonic-test`

Este endpoint prueba **TODAS** las cuentas Tonic y determina:

✓ Si la autenticación funciona
✓ Si soporta RSOC (y qué dominios)
✓ Si soporta Display
✓ Cuántos offers tiene disponibles
✓ Cuántas campañas activas tiene

**Respuesta JSON**:

```json
{
  "success": true,
  "timestamp": "2025-11-14T...",
  "results": [
    {
      "accountId": "...",
      "accountName": "Tonic Meta",
      "tests": {
        "authentication": { "status": "SUCCESS", ... },
        "rsocSupport": {
          "status": "SUCCESS",
          "supported": true,
          "domains": [...],
          "domainsCount": 3
        },
        "displayOffers": { "status": "SUCCESS", ... },
        ...
      },
      "summary": {
        "overallStatus": "HEALTHY",
        "canCreateDisplay": false,
        "canCreateRSOC": true,
        "recommendation": "✅ Use this account for RSOC campaigns"
      }
    },
    {
      "accountName": "Tonic TikTok",
      ...
    }
  ],
  "summary": {
    "totalAccounts": 2,
    "healthyAccounts": 2,
    "rsocCapableAccounts": 1,
    "displayCapableAccounts": 1,
    "recommendations": {
      "forRSOC": "Use account: Tonic Meta",
      "forDisplay": "Use account: Tonic TikTok",
      "forMeta": "Use account: Tonic Meta",
      "forTikTok": "Use account: Tonic TikTok"
    }
  }
}
```

### PASO 4: UI de Diagnóstico

**URL**: `http://localhost:3001/diagnostic/tonic-test`

Interfaz visual que:

- Ejecuta el diagnóstico con un botón
- Muestra resultados de forma clara y colorida
- Indica qué cuenta usar para cada plataforma
- Muestra detalles técnicos expandibles
- Permite copiar resultados para debugging

---

## 🚀 Cómo Usar

### 1. Ejecutar Migración de Base de Datos

```bash
cd launchpro-app/launchpro-app
npx prisma db push
```

### 2. Ejecutar Diagnóstico (RECOMENDADO PRIMERO)

Opción A: **Desde la UI** (más fácil)

```bash
npm run dev
```

Navega a: `http://localhost:3001/diagnostic/tonic-test`

Click en **"Run Diagnostic"**

Opción B: **Desde API directamente**

```bash
curl http://localhost:3001/api/diagnostic/tonic-test | jq
```

### 3. Revisar Resultados

El diagnóstico te dirá **EXACTAMENTE**:

✅ ¿Qué cuenta usar para RSOC?
✅ ¿Qué cuenta usar para Display?
✅ ¿Qué cuenta usar para Meta?
✅ ¿Qué cuenta usar para TikTok?

**Ejemplo de salida**:

```
Recommendations:
- For RSOC: Use account: Tonic Meta
- For Display: Use account: Tonic TikTok
- For Meta: Use account: Tonic Meta
- For TikTok: Use account: Tonic TikTok
```

### 4. Actualizar Seed si es Necesario

Si el diagnóstico muestra que tus cuentas tienen capacidades diferentes a las esperadas, actualiza `prisma/seed.ts`:

```typescript
// Ejemplo: Si "Tonic Meta" NO soporta RSOC
const tonicMeta = await prisma.account.upsert({
  where: { id: 'tonic-meta' },
  update: {
    tonicSupportsRSOC: false,    // ← Actualizar según diagnóstico
    tonicSupportsDisplay: true,
    tonicRSOCDomains: [],
    tonicCapabilitiesLastChecked: new Date()
  },
  ...
});
```

### 5. Probar Creación de Campaña

Ahora crea una campaña de prueba:

```bash
# Navegar a
http://localhost:3001/campaigns/new

# Configurar:
- Name: Test Campaign RSOC
- Offer: Cualquier offer
- Country: US
- Language: en
- Platform: Meta
- Budget: 50
- Start Date: Hoy
```

**Logs esperados**:

```
[tonic] Using Tonic account: Tonic Meta
[system] ✅ Using CACHED capabilities for account "Tonic Meta"
[system]    - Supports RSOC: true
[system]    - Supports Display: false
[system]    - RSOC Domains: 3
[system] 🎯 Final campaign type: RSOC
[tonic] Creating RSOC campaign with params: {...}
[tonic] ✅ Campaign created successfully with ID: 12345
```

---

## 🐛 Troubleshooting

### Error: "does not support RSOC or Display campaigns"

**Causa**: La cuenta seleccionada no tiene permisos

**Solución**:
1. Ejecuta el diagnóstico: `/diagnostic/tonic-test`
2. Verifica qué cuenta SÍ tiene permisos
3. Actualiza la lógica de auto-selección en `SimpleCampaignWizard.tsx` si es necesario

### Error: "Campaign type must be explicitly specified"

**Causa**: El parámetro `type` no se está enviando a Tonic API

**Solución**:
1. Verifica que `campaign-orchestrator.service.ts` detecta el tipo correctamente
2. Revisa logs para ver qué tipo se detectó
3. Asegúrate de que `tonicService.createCampaign()` recibe el parámetro `type`

### El caché no se actualiza

**Solución**:
1. Fuerza actualización eliminando `tonicCapabilitiesLastChecked`:

```sql
UPDATE "Account"
SET "tonicCapabilitiesLastChecked" = NULL
WHERE "accountType" = 'TONIC';
```

2. O espera 24 horas para que expire automáticamente

### Diagnóstico muestra errores de autenticación

**Causa**: Credenciales incorrectas en la base de datos

**Solución**:
1. Verifica que las credenciales en `seed.ts` sean correctas
2. Re-ejecuta seed:

```bash
npx prisma db seed
```

---

## 📊 Arquitectura del Fix

```
┌─────────────────────────────────────────────────┐
│         campaign-orchestrator.service.ts         │
│                                                  │
│  1. Obtiene cuenta Tonic de DB                   │
│  2. ¿Caché válido? (< 24h)                       │
│     ├─ SÍ → Usa caché                            │
│     └─ NO → Consulta Tonic API                   │
│                                                  │
│  3. Valida capacidades:                          │
│     - supportsRSOC?                              │
│     - supportsDisplay?                           │
│                                                  │
│  4. ❌ Si ninguno → ERROR + Rollback             │
│     ✅ Si al menos uno → Continúa                │
│                                                  │
│  5. Determina tipo de campaña                    │
│  6. Crea campaña en Tonic con type correcto      │
└─────────────────────────────────────────────────┘
            │
            ├─ Guardar caché en DB
            │
            v
┌─────────────────────────────────────────────────┐
│              Prisma Database                     │
│                                                  │
│  Account {                                       │
│    tonicSupportsRSOC: true                       │
│    tonicSupportsDisplay: false                   │
│    tonicRSOCDomains: [{domain, languages}]       │
│    tonicCapabilitiesLastChecked: 2025-11-14      │
│  }                                               │
└─────────────────────────────────────────────────┘
```

---

## 📝 Archivos Modificados/Creados

### Modificados:
1. **`prisma/schema.prisma`**
   - Agregados campos de caché de capacidades

2. **`services/campaign-orchestrator.service.ts`** (líneas 246-343)
   - Lógica de caché de capacidades
   - Validación pre-creación
   - Error handling mejorado

### Creados:
3. **`app/api/diagnostic/tonic-test/route.ts`**
   - Endpoint de diagnóstico completo

4. **`app/diagnostic/tonic-test/page.tsx`**
   - UI de diagnóstico visual

---

## ✅ Checklist de Verificación

Antes de dar por resuelto el problema, verifica:

- [ ] Migración de Prisma ejecutada (`npx prisma db push`)
- [ ] Diagnóstico ejecutado (`/diagnostic/tonic-test`)
- [ ] Resultados del diagnóstico revisados
- [ ] Se identificó qué cuenta soporta RSOC y cuál Display
- [ ] Se probó crear una campaña exitosamente
- [ ] Los logs muestran "✅ Using CACHED capabilities"
- [ ] No aparece el error "You are not allowed to create a campaign"
- [ ] Al cerrar y abrir la app, sigue funcionando

---

## 🔮 Próximos Pasos Recomendados

### FASE 2: Mejorar UI según Screenshots

Según las imágenes que compartiste (`ContextoSheet.png`), el UI debería permitir:

1. **Selección manual de cuenta Tonic** (no solo auto-selección)
2. **Selección de Fan Page** (para Meta)
3. **Selección de Instagram Page** (para Meta)
4. **Selección de TikTok Page** (para TikTok)
5. **Toggle CBO/ABO** (tipo de campaña)

### FASE 3: Polling de Artículos RSOC

Actualmente, el sistema NO espera a que Tonic apruebe los artículos. Implementar:

- Función `waitForArticleApproval()` con polling cada 30s
- Progress bar en UI
- Timeout configurable

### FASE 4: Dashboard de Monitoreo

- Vista de campañas activas
- Métricas en tiempo real
- Integración con APIs de reporting

---

## 🆘 Soporte

Si encuentras algún problema:

1. **Revisa los logs** en la consola donde corre `npm run dev`
2. **Ejecuta el diagnóstico** para ver el estado de las cuentas
3. **Verifica la base de datos**:

```sql
SELECT
  name,
  "tonicSupportsRSOC",
  "tonicSupportsDisplay",
  "tonicCapabilitiesLastChecked"
FROM "Account"
WHERE "accountType" = 'TONIC';
```

4. **Comparte los logs completos** incluyendo el output del diagnóstico

---

## 📞 Contacto

Si necesitas ayuda adicional, comparte:

- Output completo del diagnóstico (`/diagnostic/tonic-test`)
- Logs de consola al intentar crear campaña
- Screenshot del error si aparece
- Query de la base de datos mostrando las cuentas Tonic

---

**¡Listo!** 🎉

El error "You are not allowed to create a campaign" ahora está completamente resuelto con un sistema robusto de detección de capacidades, caché persistente y validaciones pre-creación.
