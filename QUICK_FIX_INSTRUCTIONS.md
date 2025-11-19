# ⚡ SOLUCIÓN RÁPIDA - Error "You're not allowed to create a campaign"

**Para**: Roberto
**Problema**: Error al crear campañas RSOC porque falta `headline_id`
**Solución**: Sistema de polling automático implementado ✅

---

## 🎯 TL;DR - Qué Hacer AHORA

### Paso 1: Reiniciar el Servidor

```bash
# Si ya está corriendo, detenerlo (Ctrl+C)
# Luego reiniciar
npm run dev
```

### Paso 2: Probar con un País NUEVO

```bash
# Navega a: http://localhost:3001/campaigns/new

# Configura:
Campaign Name: Test RSOC Polling
Offer: Car Loans (800)
Country: MX  # ← IMPORTANTE: Usar país DIFERENTE a CO
Language: Spanish
Platform: Meta
Budget: 50
Start Date: Hoy
```

**¿Por qué país diferente?**
- Porque CO ya tiene un artículo solicitado (#210699) que está pendiente
- MX es nuevo, el sistema creará un artículo nuevo y esperará aprobación

### Paso 3: Observar los Logs

Verás algo como:

```
[TONIC] Article request created with request_id: 210705
[TONIC] ⚠️  No existing approved headline found
[TONIC] ⏳ Will wait for article #210705 to be approved...
[article-polling] ⏳ Starting to wait... (max 10 minutes)
[article-polling] 🔍 Checking status (attempt 1)
[article-polling] 📄 Status: pending
[article-polling] ⏳ Still pending... checking again in 30s
```

---

## 🚨 OPCIONES QUE TIENES

### Opción A: Dejar que Espere Automáticamente (RECOMENDADO)

**Qué hace**:
- El sistema esperará hasta 10 minutos
- Revisará cada 30 segundos
- Si Tonic aprueba → ✅ crea la campaña
- Si Tonic rechaza → ❌ error claro con instrucciones

**Cuándo usar**:
- Si Tonic normalmente aprueba rápido (minutos)
- Si no tienes prisa
- Testing/desarrollo

**Ventajas**:
- ✅ Completamente automático
- ✅ No requiere intervención manual
- ✅ Funciona 24/7

### Opción B: Aprobar Manualmente en Tonic (MÁS RÁPIDO)

**Pasos**:

1. **Ir a Tonic Dashboard**:
   ```
   https://publisher.tonic.com
   ```

2. **Buscar el artículo pendiente**:
   - Request ID: 210699 (o el que veas en los logs)
   - Offer: Car Loans
   - País: CO

3. **Aprobar el artículo** manualmente

4. **Esperar 2-3 minutos** (para que se sincronice)

5. **Reintentar crear la campaña** (ahora usará el artículo aprobado)

**Ventajas**:
- ⚡ Control total
- 🎯 Sabes exactamente cuándo está listo
- 📝 Puedes editar el contenido antes de aprobar

### Opción C: Usar un País que YA Tenga Artículo Aprobado

**Cuáles países tienen artículos aprobados?**

Ejecuta esto para saberlo:

```bash
curl "http://localhost:3001/api/diagnostic/tonic-test" | jq '.results[0].tests.rsocOffers.sampleOffers'
```

O manualmente ve a:
```
http://localhost:3001/diagnostic/tonic-test
```

Y busca en "RSOC Offers" → "View Sample Offers"

**Luego**:
- Crea una campaña con ese offer + país
- Será **INSTANTÁNEO** (sin espera)

---

## 📊 Entender los Logs

### Logs de ÉXITO:

```
[TONIC] ✅ Using EXISTING headline_id: 12345
[TONIC] Creating RSOC campaign...
[TONIC] ✅ Campaign created successfully with ID: 67890
```

**Significado**: Encontró artículo existente, creación instantánea ✅

---

### Logs de ESPERA (Normal):

```
[article-polling] ⏳ Starting to wait for article approval...
[article-polling] 🔍 Checking article status (attempt 1)
[article-polling] 📄 Article request status: pending
[article-polling] ⏳ Article still pending... (0m 30s elapsed)
[article-polling] 🔍 Checking article status (attempt 2)
[article-polling] 📄 Article request status: published
[article-polling] ✅ Article approved! headline_id: 12345
[TONIC] 🎉 Article approved after 1m 15s!
```

**Significado**: Sistema esperando aprobación, TODO NORMAL ⏳

---

### Logs de ERROR (Timeout):

```
[article-polling] ⏰ Timeout: Article approval took longer than 10 minutes
[SYSTEM] Rolling back campaign...
[API] Error: RSOC article approval failed: Timeout
```

**Significado**: Tonic no aprobó en 10 minutos ⏰

**Qué hacer**:
1. Aprobar manualmente en Tonic dashboard
2. O aumentar `maxWaitMinutes` en el código (ver abajo)

---

### Logs de ERROR (Rechazado):

```
[article-polling] ❌ Article was rejected: Content does not meet quality guidelines
[SYSTEM] Rolling back campaign...
```

**Significado**: Tonic rechazó el artículo ❌

**Qué hacer**:
1. Ver `rejection_reason` en los logs
2. Ajustar el contenido (editar prompts de IA)
3. Reintentar

---

## ⚙️ Ajustar Configuración (Opcional)

### Cambiar Tiempo de Espera

Editar: `services/campaign-orchestrator.service.ts` (línea ~427)

```typescript
const pollingResult = await waitForArticleApproval(credentials, articleRequestId, {
  maxWaitMinutes: 10,  // ← Cambiar aquí (ej: 30 para esperar más)
  pollingIntervalSeconds: 30,  // ← Cambiar aquí (ej: 15 para revisar más seguido)
});
```

**Recomendaciones**:
- **Development**: `maxWaitMinutes: 5` (rápido, falla pronto)
- **Production**: `maxWaitMinutes: 60` (paciente, menos timeouts)

### Verificar Estado de Artículo Manualmente

```bash
# Reemplaza los valores
curl "http://localhost:3001/api/rsoc/article-status?requestId=210699&accountId=cmhvl0uln0001v1r8pncb0ot0"
```

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "requestId": "210699",
    "headlineId": null,
    "status": "pending",
    "statusExplanation": "⏳ Article is waiting for Tonic review",
    "canBeUsed": false
  }
}
```

---

## 🎯 Plan de Acción INMEDIATO

### Para Resolver tu Error AHORA:

**Opción 1 (Más Rápido - 2 minutos)**:
1. Ir a https://publisher.tonic.com
2. Aprobar artículo #210699 manualmente
3. Reintentar crear campaña en LaunchPro
4. ✅ Debería funcionar

**Opción 2 (Automático - 1-10 minutos)**:
1. Reiniciar servidor (`npm run dev`)
2. Crear campaña con país DIFERENTE (ej: MX en vez de CO)
3. Dejar que el sistema espere aprobación
4. ✅ Se creará automáticamente cuando Tonic apruebe

**Opción 3 (Testing Rápido - Instantáneo)**:
1. Ejecutar diagnóstico: `http://localhost:3001/diagnostic/tonic-test`
2. Ver qué offers + países ya tienen artículos aprobados
3. Crear campaña con esa combinación
4. ✅ Funciona instantáneamente

---

## 📞 Si Sigues Teniendo Problemas

**Comparte conmigo**:

1. **Logs completos** desde que inicias la creación de campaña hasta el error

2. **Estado del artículo**:
   ```bash
   curl "http://localhost:3001/api/rsoc/article-status?requestId=210699&accountId=cmhvl0uln0001v1r8pncb0ot0"
   ```

3. **Diagnóstico de cuentas**:
   ```bash
   curl "http://localhost:3001/api/diagnostic/tonic-test"
   ```

4. **Query de base de datos**:
   ```sql
   SELECT "tonicArticleId", status, country, "offerId"
   FROM "Campaign"
   WHERE "tonicArticleId" IS NOT NULL
   ORDER BY "createdAt" DESC
   LIMIT 5;
   ```

---

## ✅ Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] Reiniciaste el servidor después de los cambios
- [ ] Estás usando un país DIFERENTE al que falló
- [ ] Los logs muestran `[article-polling]` mensajes
- [ ] Esperaste al menos 2-3 minutos para la aprobación
- [ ] No hay errores de autenticación de Tonic
- [ ] La conexión a internet está estable

---

## 🚀 Siguiente Paso

Una vez que esto funcione, podemos implementar **FASE 2**:

- ✅ Mejorar UI según los screenshots que compartiste
- ✅ Agregar selección manual de cuentas
- ✅ Agregar campos de Fan Page, Instagram Page, TikTok Page
- ✅ Progress bar visual durante aprobación de artículo
- ✅ Dashboard de campañas activas

**¿Listo para probar?** 🎯

Reinicia el servidor y crea una campaña con un país nuevo. Los logs te dirán exactamente qué está pasando.
