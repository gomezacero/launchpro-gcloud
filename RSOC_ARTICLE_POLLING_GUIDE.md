# 🎯 Guía del Sistema de Polling de Artículos RSOC

**Fecha**: 14 de Noviembre de 2025
**Estado**: ✅ IMPLEMENTADO - FASE 3
**Autor**: Claude (Anthropic)

---

## 📋 Resumen Ejecutivo

He implementado un sistema completo de **polling automático** para esperar la aprobación de artículos RSOC en Tonic. Esto resuelve definitivamente el error "You're not allowed to create a campaign" al asegurar que siempre tengamos un `headline_id` válido antes de crear campañas RSOC.

---

## 🎯 El Problema que Resuelve

### Antes (PROBLEMÁTICO):

```
1. Crear solicitud de artículo → request_id: 210699
2. Buscar artículos aprobados previos → NO encontrado
3. Intentar crear campaña SIN headline_id → ❌ ERROR
```

**Resultado**: "You're not allowed to create a campaign"

### Ahora (SOLUCIONADO):

```
1. Crear solicitud de artículo → request_id: 210699
2. Buscar artículos aprobados previos → NO encontrado
3. ⏳ ESPERAR a que Tonic apruebe el artículo (polling cada 30s)
4. ✅ Artículo aprobado → headline_id: 12345
5. Crear campaña CON headline_id → ✅ ÉXITO
```

**Resultado**: Campaña creada exitosamente

---

## 🔧 Cómo Funciona

### Estrategia de Dos Niveles

El sistema usa una estrategia inteligente de dos niveles:

#### **NIVEL 1: Usar Artículos Existentes (RÁPIDO)**

```typescript
// Buscar artículos ya aprobados para este offer + país
const matchingHeadline = headlines.find((h) =>
  h.offer_id === offerId &&
  h.country === country
);

if (matchingHeadline) {
  // ✅ ENCONTRADO! Usar inmediatamente
  articleHeadlineId = matchingHeadline.headline_id;
  // Continuar con creación de campaña
}
```

**Ventajas**:
- ⚡ Instantáneo (no espera)
- 💰 Sin costo adicional de tiempo
- ✅ Reutiliza artículos aprobados

**Cuándo se usa**:
- Ya tienes campañas previas para el mismo offer + país
- El artículo fue aprobado anteriormente

#### **NIVEL 2: Polling Automático (ESPERA SI ES NECESARIO)**

```typescript
// Si no hay artículo existente, esperar aprobación
const pollingResult = await waitForArticleApproval(credentials, requestId, {
  maxWaitMinutes: 10,        // Máximo 10 minutos
  pollingIntervalSeconds: 30, // Revisar cada 30 segundos
  onProgress: (status, elapsed) => {
    // Mostrar progreso en logs
  }
});

if (pollingResult.success) {
  // ✅ APROBADO! Usar headline_id
  articleHeadlineId = pollingResult.headlineId;
}
```

**Ventajas**:
- ⏳ Espera inteligente (max 10 minutos configurable)
- 📊 Updates de progreso cada 30 segundos
- ❌ Fail rápido si es rechazado
- 🔄 Rollback automático si timeout

**Cuándo se usa**:
- Primera vez que usas ese offer + país
- No hay artículos aprobados previamente
- Artículo necesita revisión manual

---

## 📁 Archivos Implementados

### 1. **`lib/article-polling.ts`** (NUEVO)

**Funciones principales**:

#### `waitForArticleApproval(credentials, requestId, options)`

Espera a que un artículo sea aprobado.

**Parámetros**:
```typescript
{
  credentials: TonicCredentials,      // Credenciales de Tonic
  requestId: number,                  // ID del artículo solicitado
  options: {
    maxWaitMinutes: 10,               // Tiempo máximo de espera
    pollingIntervalSeconds: 30,       // Cada cuánto revisar
    onProgress: (status, elapsed) => {} // Callback de progreso
  }
}
```

**Retorna**:
```typescript
{
  success: boolean,           // ¿Se aprobó?
  headlineId?: string,        // headline_id si fue aprobado
  status?: string,            // 'published', 'rejected', etc.
  error?: string,             // Mensaje de error si falló
  elapsedSeconds: number,     // Tiempo total esperado
  attemptsCount: number       // Intentos realizados
}
```

**Estados posibles**:
- `pending` → ⏳ Esperando revisión
- `in_review` → 👀 En revisión
- `published` → ✅ Aprobado (SUCCESS)
- `rejected` → ❌ Rechazado (FAIL)

#### `formatElapsedTime(seconds)`

Formatea tiempo en formato legible: `"2m 30s"`

---

### 2. **`services/campaign-orchestrator.service.ts`** (MODIFICADO)

**Cambios en STEP 4 (líneas 396-458)**:

```typescript
// STRATEGY 1: Check for existing approved headlines first
const headlines = await tonicService.getHeadlines(credentials);
const matchingHeadline = headlines.find(...);

if (matchingHeadline) {
  // ✅ Use existing
  articleHeadlineId = matchingHeadline.headline_id;
} else {
  // STRATEGY 2: Wait for new article to be approved
  const pollingResult = await waitForArticleApproval(...);

  if (pollingResult.success) {
    articleHeadlineId = pollingResult.headlineId;
  } else {
    // Rollback and fail with clear message
    throw new Error(...);
  }
}
```

**Beneficios**:
- ✅ Siempre tiene `headline_id` antes de crear campaña
- ⏳ Espera inteligente con timeout
- 📊 Logging detallado de progreso
- 🔄 Rollback automático si falla

---

### 3. **`app/api/rsoc/article-status/route.ts`** (NUEVO)

**Endpoint manual para verificar estado**:

```
GET /api/rsoc/article-status?requestId=210699&accountId=xxx
```

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "requestId": "210699",
    "headlineId": "12345",
    "status": "published",
    "rejectionReason": null,
    "offer": "Car Loans",
    "country": "CO",
    "language": "es",
    "statusExplanation": "✅ Article has been approved and is ready to use!",
    "canBeUsed": true
  }
}
```

**Uso**:
- Verificar manualmente el estado de un artículo
- Debugging si el polling falla
- Ver por qué fue rechazado

---

## 🚀 Cómo Probarlo

### Opción 1: Dejar que el Sistema Espere Automáticamente

1. **Crea una campaña RSOC** con un offer + país que NO hayas usado antes:

```bash
# Ejemplo: Car Loans (800) en México (MX)
Campaign Name: Test RSOC Mexico
Offer: Car Loans (800)
Country: MX  # ← Importante: usar un país NUEVO
Language: Spanish
Platform: Meta
```

2. **Observa los logs**:

```
[TONIC] Article request created with request_id: 210700
[TONIC] 🔍 Checking for existing approved headlines...
[TONIC] Found 678 total approved headlines
[TONIC] ⚠️  No existing approved headline found for this offer/country combination.
[TONIC] ⏳ Will wait for article request #210700 to be approved...
[article-polling] ⏳ Starting to wait for article approval... { requestId: 210700, maxWaitMinutes: 10 }
[article-polling] 🔍 Checking article status (attempt 1)... { elapsedSeconds: 0 }
[article-polling] 📄 Article request status: pending
[article-polling] ⏳ Article still pending approval... { nextCheckIn: 30 }
[article-polling] 🔍 Checking article status (attempt 2)... { elapsedSeconds: 30 }
[article-polling] 📄 Article request status: published
[article-polling] ✅ Article approved! headline_id: 12346
[TONIC] 🎉 Article approved after 45s! { headlineId: 12346 }
[TONIC] Creating RSOC campaign with headline_id: 12346
[TONIC] ✅ Campaign created successfully!
```

3. **Resultado esperado**:
   - ✅ La campaña se crea exitosamente
   - ⏳ Esperó automáticamente la aprobación
   - 📊 Logs muestran el progreso cada 30 segundos

### Opción 2: Usar País Existente (Rápido, sin Espera)

1. **Crea una campaña con offer + país que YA hayas usado**:

```bash
# Si ya tienes artículo aprobado para Car Loans + US
Campaign Name: Test RSOC US Fast
Offer: Car Loans (800)
Country: US  # ← Ya existe artículo aprobado
Language: English
Platform: Meta
```

2. **Logs esperados**:

```
[TONIC] 🔍 Checking for existing approved headlines...
[TONIC] Found 678 total approved headlines
[TONIC] ✅ Using EXISTING headline_id: 12345
[TONIC] Creating RSOC campaign with headline_id: 12345
[TONIC] ✅ Campaign created successfully!
```

3. **Resultado**:
   - ⚡ INSTANTÁNEO (sin espera)
   - ✅ Usa artículo previamente aprobado

### Opción 3: Verificar Estado Manualmente

```bash
# Verificar el estado del artículo 210699
curl "http://localhost:3001/api/rsoc/article-status?requestId=210699&accountId=cmhvl0uln0001v1r8pncb0ot0"
```

**Respuesta si está aprobado**:
```json
{
  "success": true,
  "data": {
    "requestId": "210699",
    "headlineId": "12345",
    "status": "published",
    "statusExplanation": "✅ Article has been approved and is ready to use!",
    "canBeUsed": true
  }
}
```

**Respuesta si aún está pendiente**:
```json
{
  "success": true,
  "data": {
    "requestId": "210699",
    "headlineId": null,
    "status": "pending",
    "statusExplanation": "⏳ Article is waiting for Tonic review. This usually takes a few minutes to hours.",
    "canBeUsed": false
  }
}
```

---

## ⚙️ Configuración

### Ajustar Tiempo de Espera

Edita `services/campaign-orchestrator.service.ts` (línea 427-429):

```typescript
const pollingResult = await waitForArticleApproval(credentials, articleRequestId, {
  maxWaitMinutes: 10,        // ← Cambiar aquí (default: 10 minutos)
  pollingIntervalSeconds: 30, // ← Cambiar aquí (default: 30 segundos)
});
```

**Recomendaciones**:
- **Desarrollo**: `maxWaitMinutes: 5` (espera corta para testing)
- **Producción**: `maxWaitMinutes: 60` (espera más tiempo, menos timeouts)
- **Impatiente**: `maxWaitMinutes: 2` + mensaje al usuario para aprobar manualmente

### Deshabilitar Polling (Solo Artículos Existentes)

Si solo quieres usar artículos existentes y NO esperar aprobación:

```typescript
if (matchingHeadline) {
  articleHeadlineId = matchingHeadline.headline_id;
} else {
  // En vez de polling, fallar inmediatamente
  throw new Error(
    `No approved article found for ${offer.name} in ${params.country}. ` +
    `Please create and approve an article manually first.`
  );
}
```

---

## 📊 Escenarios de Uso

### Escenario 1: Primera Campaña RSOC para Offer + País

**Ejemplo**: Car Loans en Colombia (primera vez)

```
1. Usuario crea campaña
2. Sistema genera artículo con IA
3. Envía solicitud a Tonic → request_id: 210699
4. NO encuentra artículo existente
5. ⏳ Inicia polling (espera max 10 min)
6. Tonic aprueba artículo → headline_id: 12345
7. ✅ Crea campaña RSOC exitosamente
```

**Tiempo**: 1-10 minutos (depende de velocidad de Tonic)

### Escenario 2: Segunda Campaña RSOC para Mismo Offer + País

**Ejemplo**: Otra campaña Car Loans en Colombia

```
1. Usuario crea campaña
2. Sistema genera artículo con IA (diferente contenido)
3. Envía solicitud a Tonic → request_id: 210700
4. ✅ ENCUENTRA artículo existente (headline_id: 12345)
5. ⚡ USA artículo existente inmediatamente
6. ✅ Crea campaña RSOC exitosamente
```

**Tiempo**: INSTANTÁNEO (sin espera)

### Escenario 3: Artículo Rechazado

**Ejemplo**: Artículo no cumple políticas de Tonic

```
1. Usuario crea campaña
2. Sistema genera artículo con IA
3. Envía solicitud a Tonic → request_id: 210699
4. ⏳ Inicia polling
5. Tonic RECHAZA artículo → status: rejected
6. ❌ Sistema detecta rechazo
7. 🔄 Rollback automático de campaña
8. 📧 Error claro al usuario con razón de rechazo
```

**Mensaje de error**:
```
RSOC article approval failed: Article was rejected: Content does not meet quality guidelines.
The article request (#210699) needs manual review in your Tonic dashboard.
You can approve it at: https://publisher.tonic.com
```

### Escenario 4: Timeout (Tonic tarda mucho)

**Ejemplo**: Aprobación toma más de 10 minutos

```
1. Usuario crea campaña
2. Sistema genera artículo
3. ⏳ Inicia polling (max 10 min)
4. Tonic NO aprueba en 10 minutos
5. ⏰ Timeout
6. 🔄 Rollback automático
7. 📧 Error al usuario con instrucciones
```

**Mensaje de error**:
```
RSOC article approval failed: Timeout: Article approval took longer than 10 minutes.
The article request (#210699) needs manual review in your Tonic dashboard.
You can approve it at: https://publisher.tonic.com
```

**Solución**: Aprobar manualmente en Tonic y reintentar

---

## 🐛 Troubleshooting

### Error: "Article approval failed or timed out"

**Causa**: Tonic no aprobó el artículo en el tiempo configurado

**Solución**:
1. Ve a https://publisher.tonic.com
2. Busca la solicitud de artículo (request_id en el error)
3. Apruébala manualmente
4. Reintenta crear la campaña (usará el artículo aprobado)

### Error: "Article was rejected"

**Causa**: Tonic rechazó el artículo (calidad, políticas, etc.)

**Solución**:
1. Revisa `rejection_reason` en los logs
2. Ajusta el contenido generado por IA
3. O usa un artículo existente aprobado

### Polling se queda "stuck"

**Causa**: Problema de red o API de Tonic caída

**Logs**:
```
[article-polling] ❌ Error checking article status: Network timeout
[article-polling] 🔍 Checking article status (attempt 10)...
[article-polling] ❌ Error checking article status: Network timeout
```

**Solución**:
- El sistema reintentará automáticamente
- Si persiste después de varios intentos, verifica conexión a internet
- Verifica que la API de Tonic esté funcionando

---

## ✅ Ventajas del Sistema

### 1. **Cero Errores de headline_id Faltante**
- Siempre espera hasta tener un `headline_id` válido
- No más "You're not allowed to create a campaign"

### 2. **Reutilización Inteligente**
- Usa artículos existentes cuando es posible (rápido)
- Solo espera aprobación si es realmente necesario

### 3. **Transparencia Total**
- Logs detallados de cada paso
- El usuario sabe exactamente qué está pasando
- Progress updates cada 30 segundos

### 4. **Fail-Safe**
- Timeout configurable para no esperar eternamente
- Rollback automático si falla
- Mensajes de error claros y accionables

### 5. **Flexible**
- Tiempos configurables
- Callbacks de progreso opcionales
- Fácil de adaptar a necesidades específicas

---

## 📝 Próximos Pasos Opcionales

### 1. **UI de Progreso en Tiempo Real**

Mostrar en la UI el progreso del polling:

```tsx
// components/ArticleApprovalProgress.tsx
<div className="progress-bar">
  <p>⏳ Esperando aprobación de artículo...</p>
  <p>Tiempo transcurrido: {elapsedTime}</p>
  <p>Estado: {articleStatus}</p>
</div>
```

Usar WebSocket o Server-Sent Events para updates en tiempo real.

### 2. **Dashboard de Artículos**

Ver todos los artículos solicitados y su estado:

```
/rsoc/articles
- request_id: 210699 | Status: Published ✅
- request_id: 210700 | Status: Pending ⏳
- request_id: 210701 | Status: Rejected ❌
```

### 3. **Auto-Retry con Modificaciones**

Si un artículo es rechazado, regenerar automáticamente con ajustes:

```typescript
if (status === 'rejected') {
  // Regenerar con prompt modificado
  const newArticle = await aiService.generateArticle({
    ...params,
    stricterGuidelines: true
  });
  // Reintentar solicitud
}
```

---

## 🎉 Conclusión

El sistema de polling de artículos RSOC está **completamente implementado** y listo para usar. Esto resuelve definitivamente el problema de "You're not allowed to create a campaign" al asegurar que:

✅ Siempre tenemos un `headline_id` válido antes de crear campañas RSOC
✅ Reutilizamos artículos existentes cuando es posible (rápido)
✅ Esperamos automáticamente la aprobación cuando es necesario
✅ Manejamos errores y timeouts de forma elegante
✅ Proporcionamos feedback claro al usuario

**¡Ahora puedes crear campañas RSOC sin preocuparte por el error!** 🚀
