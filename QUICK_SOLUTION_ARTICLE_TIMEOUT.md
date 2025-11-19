# ⏰ Solución Rápida - Timeout de Aprobación de Artículos

**Problema**: Los artículos tardan más de 10 minutos en aprobarse

---

## ✅ Solución Aplicada

### Cambio 1: Aumentar Timeout a 60 Minutos

**Archivo**: `services/campaign-orchestrator.service.ts` (línea 428)

**ANTES**:
```typescript
maxWaitMinutes: 10, // Wait max 10 minutes
```

**DESPUÉS**:
```typescript
maxWaitMinutes: 60, // Wait max 60 minutes (Tonic can take longer in development/testing)
```

---

## 🚀 Alternativa MÁS RÁPIDA: Usar Artículos Existentes

En lugar de crear un artículo nuevo cada vez (que tarda 10-60 minutos en aprobar), **reutiliza artículos ya aprobados**.

### Opción A: Usar el Endpoint de Artículos Aprobados

Puedes consultar artículos ya aprobados:

```bash
curl -X GET "https://api.publisher.tonic.com/privileged/v3/rsoc/headlines" \
  -H "Authorization: Bearer TU_TOKEN"
```

Esto te dará una lista de artículos ya aprobados con sus `headline_id`.

### Opción B: Ver en Tonic Dashboard

1. Ve a: https://publisher.tonic.com
2. Busca la sección de artículos RSOC
3. Copia el `headline_id` de un artículo aprobado
4. Úsalo directamente en la creación de campaña

---

## 📊 Comparación de Tiempos

| Método | Tiempo Aproximado |
|--------|-------------------|
| **Crear artículo nuevo** | 10-60 minutos (esperando aprobación) |
| **Usar artículo existente** | ⚡ Instantáneo (0 segundos) |

---

## 🔧 Cómo Probar Ahora

### Opción 1: Esperar con Timeout de 60 Minutos

1. Reinicia el servidor: `npm run dev`
2. Crea una campaña normalmente
3. El sistema esperará hasta 60 minutos
4. Si Tonic aprueba en ese tiempo → ✅ Campaña creada

### Opción 2: Aprobar Manualmente en Tonic

1. Crear campaña en LaunchPro
2. Ver el `request_id` en los logs (ej: #210715)
3. Ir a https://publisher.tonic.com
4. Aprobar el artículo manualmente
5. El sistema detectará la aprobación automáticamente

### Opción 3: Usar Artículo Existente (MÁS RÁPIDO)

Actualmente LaunchPro intenta buscar artículos existentes PRIMERO (líneas 396-410 en campaign-orchestrator.service.ts):

```typescript
// STRATEGY 1: Check for existing approved headlines first
const headlines = await tonicService.getHeadlines(credentials);
const matchingHeadline = headlines.find((h) =>
  h.offer_id === parseInt(params.offerId) && h.country === params.country
);

if (matchingHeadline) {
  // Use existing headline (instant)
  articleHeadlineId = matchingHeadline.headline_id || matchingHeadline.id;
  logger.info('tonic', `✅ Using EXISTING headline_id: ${articleHeadlineId}`);
}
```

**Para que esto funcione automáticamente**:
- Crea campañas con el **mismo offer + país** que ya tengas artículos aprobados
- El sistema reutilizará el artículo existente automáticamente
- ⚡ Creación instantánea!

---

## 🎯 Recomendaciones

### Para Development/Testing
```typescript
maxWaitMinutes: 60  // Esperar más tiempo
```

### Para Production
```typescript
maxWaitMinutes: 120  // 2 horas (muy paciente)
```

O mejor aún:
- Crear artículos manualmente primero
- Aprobarlos en Tonic dashboard
- Luego crear campañas (que reutilizarán los artículos aprobados)

---

## 📝 Verificar Artículos Existentes

Ejecuta este endpoint para ver qué artículos ya tienes aprobados:

```bash
curl "http://localhost:3001/api/diagnostic/tonic-test"
```

O visita en el navegador:
```
http://localhost:3001/diagnostic/tonic-test
```

En la sección "RSOC Offers" → "View Sample Offers" verás qué combinaciones offer+país ya tienen artículos aprobados.

---

## ⚡ Pro Tip

Si Tonic tarda demasiado en aprobar artículos automáticamente:

1. **Crea 5-10 artículos manualmente** para tus offers más comunes
2. **Apruébalos todos** en Tonic dashboard
3. **Usa LaunchPro** → Reutilizará esos artículos automáticamente
4. **Creación instantánea** de campañas 🚀

---

**Status**: Timeout aumentado a 60 minutos ✅
**Alternativa**: Usar artículos existentes = instantáneo ⚡
