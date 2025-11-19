# 🔍 DEBUG: "You're not allowed to create a campaign"

**Status**: INVESTIGATING
**Priority**: CRITICAL

---

## 🎯 Problema

El artículo RSOC se aprueba correctamente (headline_id: `725342217`), pero la creación de la campaña falla con:

```
"You're not allowed to create a campaign"
```

**Parámetros enviados** (aparentemente correctos):
```json
{
  "name": "TonicTesting",
  "offer": "Car Loans",
  "offer_id": "800",
  "country": "CO",
  "type": "rsoc",
  "return_type": "id",
  "headline_id": "725342217",
  "domain": "inktrekker.com",
  "imprint": "no"
}
```

---

## 🔬 Hipótesis a Investigar

### Hipótesis 1: Tipo de Dato de headline_id
- ❓ ¿Tonic espera `headline_id` como **número** en vez de string?
- Actualmente enviamos: `"725342217"` (string)
- Debería ser: `725342217` (number)?

### Hipótesis 2: Tipo de Dato de offer_id
- ❓ ¿Tonic espera `offer_id` como **número** en vez de string?
- Actualmente enviamos: `"800"` (string)
- Debería ser: `800` (number)?

### Hipótesis 3: Parámetro Faltante o Incorrecto
- ❓ ¿Falta algún parámetro adicional para RSOC?
- ❓ ¿El `domain` está en el formato correcto?
- ❓ ¿Necesita algún parámetro de budget?

### Hipótesis 4: Headline_id No Pertenece a Esta Cuenta
- ❓ ¿El headline_id aprobado pertenece a la cuenta correcta?
- ❓ ¿Hay algún problema de ownership del artículo?

### Hipótesis 5: Estado del Headline
- ❓ ¿Aunque el artículo esté "published", necesita algo más?
- ❓ ¿Hay algún delay después de la aprobación?

---

## 🧪 Plan de Investigación

### PASO 1: Ejecutar Script de Test Directo

He creado un script Node.js que prueba la API de Tonic directamente:

**Archivo**: `test-tonic-campaign-creation.js`

#### Instrucciones:

1. **Edita el archivo** y reemplaza las credenciales:

```javascript
const TONIC_CONSUMER_KEY = 'tu_consumer_key_aqui';  // ← REEMPLAZAR
const TONIC_CONSUMER_SECRET = 'tu_consumer_secret_aqui';  // ← REEMPLAZAR
```

2. **Ejecuta el script**:

```bash
cd C:\Users\Roberto\Desktop\Quick\LaunchPro
node test-tonic-campaign-creation.js
```

3. **Observa los resultados**:

El script probará:
- ✅ Test 1: headline_id como **número** (725342217)
- ✅ Test 2: headline_id como **string** ("725342217")
- ✅ Test 3: Campaña Display (sin headline_id, para aislar el problema)

#### Resultados Esperados:

**Escenario A**: Test 1 funciona (headline_id como número)
```
✅ SUCCESS! Campaign created!
```
→ **Solución**: Cambiar el código para enviar headline_id como número

**Escenario B**: Test 2 funciona (headline_id como string)
```
✅ SUCCESS! Campaign created with STRING headline_id!
```
→ **Problema**: No es el tipo de dato, algo más está mal

**Escenario C**: Test 3 funciona (Display)
```
✅ Display campaign works!
```
→ **Problema**: Específico de RSOC (headline_id o domain)

**Escenario D**: Todos fallan
```
❌ Display campaign also fails
```
→ **Problema**: Permisos de cuenta

---

### PASO 2: Revisar Logs Mejorados

He agregado logging adicional en `tonic.service.ts` que mostrará:

1. **Respuesta RAW completa** de Tonic
2. **Detalles completos del error** de Axios

**Ejecuta** una nueva creación de campaña y comparte:
- Los logs que empiecen con `🔍 RAW TONIC RESPONSE`
- Los logs que empiecen con `❌ CAMPAIGN CREATION AXIOS ERROR`

---

### PASO 3: Comparar con tu Sistema Actual

Dijiste que tienes un "campaign launcher" que **SÍ funciona** con estas mismas cuentas.

#### Por favor comparte:

1. **¿Cómo creas campañas en tu sistema actual?**
   - ¿Es manual o código?
   - ¿Usas la misma API `/privileged/v3/campaign/create`?

2. **¿Puedes compartir un request exitoso?**
   - Los parámetros exactos que envías
   - El formato (JSON)
   - Los tipos de datos (número vs string)

3. **¿Puedes ver en Tonic dashboard?**
   - Ve a: https://publisher.tonic.com
   - Busca el artículo #725342217
   - Verifica:
     - ✅ Status: Published
     - ✅ Account: Tonic Meta (o el que corresponda)
     - ✅ Domain: inktrekker.com
     - ✅ Offer: Car Loans
     - ✅ Country: CO

---

## 🔍 Análisis de Logs Actuales

### Lo que está BIEN ✅

```
✅ Artículo aprobado: headline_id: 725342217
✅ Domain incluido: inktrekker.com
✅ Tipo correcto: rsoc
✅ País correcto: CO
✅ Offer correcto: Car Loans (800)
✅ Imprint correcto: no (CO no es EU)
```

### Lo que es SOSPECHOSO 🤔

```
🤔 headline_id como STRING: "725342217"
   Tonic podría esperarlo como NUMBER: 725342217

🤔 offer_id como STRING: "800"
   Tonic podría esperarlo como NUMBER: 800

🤔 Error sin detalles: responseStatus: undefined, responseData: undefined
   Axios no capturó la respuesta completa
```

---

## 💡 Posibles Soluciones

### Solución 1: Convertir headline_id y offer_id a Números

**Archivo**: `services/campaign-orchestrator.service.ts` (línea 477-486)

**ANTES**:
```typescript
const campaignParams = {
  name: params.name,
  offer: offer.name,
  offer_id: params.offerId, // ← STRING
  country: params.country,
  type: campaignType,
  return_type: 'id' as const,
  ...(articleHeadlineId && { headline_id: articleHeadlineId.toString() }), // ← STRING
  ...(campaignType === 'rsoc' && rsocDomain && { domain: rsocDomain }),
};
```

**DESPUÉS**:
```typescript
const campaignParams = {
  name: params.name,
  offer: offer.name,
  offer_id: parseInt(params.offerId), // ← NUMBER
  country: params.country,
  type: campaignType,
  return_type: 'id' as const,
  ...(articleHeadlineId && { headline_id: articleHeadlineId }), // ← NUMBER (no .toString())
  ...(campaignType === 'rsoc' && rsocDomain && { domain: rsocDomain }),
};
```

---

### Solución 2: Verificar Ownership del Headline

**Query manual** en Tonic API para verificar el artículo:

```bash
# 1. Autenticar
curl -X POST https://api.publisher.tonic.com/jwt/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "consumer_key": "TU_KEY",
    "consumer_secret": "TU_SECRET"
  }'

# 2. Obtener detalles del artículo
curl -X GET "https://api.publisher.tonic.com/privileged/v3/rsoc/request?request_id=210714" \
  -H "Authorization: Bearer TU_TOKEN"
```

**Verifica**:
- ¿El request_id 210714 existe?
- ¿Tiene headline_id 725342217?
- ¿Status es "published"?
- ¿Pertenece a tu cuenta?

---

### Solución 3: Verificar API de Campañas RSOC Existentes

**Query** para ver campañas RSOC que SÍ funcionan:

```bash
curl -X GET "https://api.publisher.tonic.com/privileged/v3/campaign/list?state=active&output=json" \
  -H "Authorization: Bearer TU_TOKEN"
```

**Compara**:
- ¿Qué parámetros tienen las campañas existentes?
- ¿Cómo se ve un campaign ID exitoso?
- ¿Hay diferencias en la estructura?

---

## 📊 Checklist de Debugging

Antes de continuar, verifica:

- [ ] Reiniciaste el servidor después de los cambios (nuevo logging)
- [ ] Ejecutaste el script `test-tonic-campaign-creation.js`
- [ ] Compartiste los logs completos con `🔍 RAW TONIC RESPONSE`
- [ ] Verificaste el artículo #725342217 en Tonic dashboard
- [ ] Comparaste con un request exitoso de tu sistema actual
- [ ] Probaste con headline_id como número en vez de string

---

## 🎯 Próximos Pasos Inmediatos

### OPCIÓN A: Test Script Primero (MÁS RÁPIDO)

1. Edita `test-tonic-campaign-creation.js` con tus credenciales
2. Ejecuta: `node test-tonic-campaign-creation.js`
3. Comparte el output completo
4. Basado en los resultados, aplicamos el fix correcto

### OPCIÓN B: Probar Fix de Tipos de Datos (SI QUIERES PROBAR YA)

1. Aplicar Solución 1 (convertir a números)
2. Reiniciar servidor
3. Crear campaña nueva
4. Ver si funciona

### OPCIÓN C: Comparar con tu Sistema Actual

1. Muéstrame exactamente cómo creas campañas en tu sistema actual
2. Comparamos los requests
3. Identificamos la diferencia exacta

---

## 📞 ¿Qué Necesito de Ti?

Para ayudarte a resolver esto **lo más rápido posible**, por favor:

1. **Ejecuta el test script** y comparte el output
2. **Comparte** cómo creas campañas en tu sistema actual que SÍ funciona
3. **Verifica** en Tonic dashboard el artículo #725342217

Con esta información podré darte la solución exacta en minutos.

---

**Status**: Waiting for test results 🔬
