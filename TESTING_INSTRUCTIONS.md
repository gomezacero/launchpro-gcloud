# 🧪 Instrucciones de Prueba del Fix de Tonic

**IMPORTANTE**: Sigue estos pasos EN ORDEN para probar el fix del error "You are not allowed to create a campaign"

---

## Paso 1: Aplicar la Migración de Base de Datos

```bash
cd launchpro-app/launchpro-app
npx prisma db push
```

**Salida esperada**:
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
✔ Applying migration
```

Si ves algún error aquí, detente y compártelo conmigo.

---

## Paso 2: Iniciar el Servidor

```bash
npm run dev
```

**Salida esperada**:
```
▲ Next.js 15.1.0
- Local:        http://localhost:3001
- Ready in X.Xs
```

---

## Paso 3: Ejecutar el Diagnóstico de Cuentas Tonic

### Opción A: Desde el Navegador (Recomendado)

1. Abre tu navegador en: **`http://localhost:3001/diagnostic/tonic-test`**

2. Haz click en el botón **"Run Diagnostic"**

3. Espera unos 10-30 segundos mientras se ejecutan las pruebas

4. **Revisa los resultados**:
   - ¿Cuántas cuentas Tonic se encontraron?
   - ¿Cuáles soportan RSOC?
   - ¿Cuáles soportan Display?
   - ¿Qué recomienda para Meta?
   - ¿Qué recomienda para TikTok?

5. **TOMA SCREENSHOT** de los resultados y guárdalo

### Opción B: Desde la Terminal

```bash
curl http://localhost:3001/api/diagnostic/tonic-test | jq
```

---

## Paso 4: Interpretar los Resultados

### Escenario 1: Ambas Cuentas Saludables ✅

```json
{
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

**Interpretación**: ✅ TODO ESTÁ BIEN

- Tonic Meta → Usa para campañas RSOC + Meta
- Tonic TikTok → Usa para campañas Display + TikTok

**Acción**: Continúa al Paso 5

---

### Escenario 2: Una Cuenta NO Soporta RSOC ⚠️

```json
{
  "results": [
    {
      "accountName": "Tonic TikTok",
      "tests": {
        "rsocSupport": {
          "status": "INFO",
          "supported": false,
          "message": "Account does not support RSOC"
        }
      },
      "summary": {
        "canCreateRSOC": false,
        "canCreateDisplay": true
      }
    }
  ]
}
```

**Interpretación**: La cuenta "Tonic TikTok" SOLO soporta Display

**Acción**:
- Si intentas crear campaña RSOC con esta cuenta → ERROR
- La lógica de caché detectará esto y usará Display automáticamente
- O fallará con mensaje claro: "Account does not support RSOC"

**Solución**: Asegúrate de usar la cuenta correcta según el tipo de campaña

---

### Escenario 3: Cuenta con Credenciales Inválidas ❌

```json
{
  "results": [
    {
      "accountName": "Tonic Meta",
      "tests": {
        "authentication": {
          "status": "ERROR",
          "message": "Authentication failed"
        }
      },
      "summary": {
        "overallStatus": "ERROR"
      }
    }
  ]
}
```

**Interpretación**: Las credenciales de la cuenta están MAL

**Acción**:
1. Verifica las credenciales en `prisma/seed.ts`
2. Actualiza con las credenciales correctas
3. Re-ejecuta seed:
   ```bash
   npx prisma db seed
   ```
4. Ejecuta diagnóstico nuevamente

---

## Paso 5: Probar Creación de Campaña (CRÍTICO)

### Test 1: Campaña para Meta con Cuenta Correcta

1. Navega a: **`http://localhost:3001/campaigns/new`**

2. Configura:
   ```
   Campaign Name: Test RSOC Meta
   Offer: (Selecciona cualquier offer disponible)
   Country: US
   Language: English
   Platform: ✓ Meta
   Budget: 50
   Start Date: (Fecha de hoy)
   ```

3. Haz click en **"Next"** y luego en **"🚀 Launch Campaign"**

4. **Observa los logs en la terminal** donde corre `npm run dev`:

**Logs EXITOSOS esperados**:

```
[tonic] Using Tonic account: Tonic Meta
[system] ✅ Using CACHED capabilities for account "Tonic Meta"
[system]    - Supports RSOC: true
[system]    - Supports Display: false
[system]    - RSOC Domains: 3
[system] 🎯 Final campaign type: RSOC
[tonic] Creating RSOC campaign with params: {
  name: 'Test RSOC Meta',
  type: 'rsoc',
  country: 'US',
  offer_id: '...'
}
[tonic] ✅ Campaign created successfully with ID: 12345
[system] Campaign created with ID: cm...
```

**Si ves estos logs → ✅ EL FIX FUNCIONA**

---

**Logs de ERROR (si aparecen)**:

```
[tonic] ❌ Account does not support RSOC or Display campaigns
[system] Rolling back campaign due to failure...
```

**Si ves esto**:
1. El diagnóstico del Paso 3 debió mostrar advertencia
2. Revisa el diagnóstico nuevamente
3. Usa una cuenta diferente

---

### Test 2: Verificar que NO se Desconfigura

1. **Detén el servidor** (Ctrl+C en la terminal)

2. **Reinicia el servidor**:
   ```bash
   npm run dev
   ```

3. **Repite el Test 1** creando otra campaña

4. **Observa los logs**, deberías ver:
   ```
   [system] ✅ Using CACHED capabilities for account "Tonic Meta"
   ```

   **NOTA**: La segunda vez NO debería llamar a la API de Tonic para detectar capacidades, usa el caché.

**Si la segunda campaña se crea exitosamente → ✅ EL CACHÉ FUNCIONA**

---

### Test 3: Campaña para TikTok

Repite el Test 1 pero selecciona **Platform: ✓ TikTok**

**Logs esperados**:

```
[tonic] Using Tonic account: Tonic TikTok
[system] ✅ Using CACHED capabilities for account "Tonic TikTok"
[system] 🎯 Final campaign type: (RSOC o Display según capacidades)
[tonic] ✅ Campaign created successfully with ID: ...
```

---

## Paso 6: Verificar Base de Datos

Conéctate a la base de datos y ejecuta:

```sql
SELECT
  name,
  "tonicSupportsRSOC",
  "tonicSupportsDisplay",
  "tonicRSOCDomains",
  "tonicCapabilitiesLastChecked"
FROM "Account"
WHERE "accountType" = 'TONIC'
ORDER BY name;
```

**Resultado esperado**:

| name | tonicSupportsRSOC | tonicSupportsDisplay | tonicRSOCDomains | tonicCapabilitiesLastChecked |
|------|-------------------|----------------------|------------------|------------------------------|
| Tonic Meta | true | false | [{domain: "...", languages: [...]}] | 2025-11-14 15:30:00 |
| Tonic TikTok | false | true | [] | 2025-11-14 15:30:00 |

**Si ves valores NULL**:
- Las capacidades AÚN no se han cacheado
- Ejecuta el diagnóstico o crea una campaña para que se cacheen

---

## Paso 7: Probar Escenario de Error (Opcional)

Para verificar que el error handling funciona correctamente:

1. Temporalmente cambia las credenciales de una cuenta Tonic a valores inválidos:

```sql
UPDATE "Account"
SET "tonicConsumerKey" = 'invalid_key_12345'
WHERE name = 'Tonic Meta';
```

2. Intenta crear una campaña

3. **Deberías ver ERROR claro**:
   ```
   [tonic] Authentication failed: Forbidden! Wrong credentials!
   [system] Campaign launch failed: Authentication failed
   [system] Rolling back campaign...
   [system] Campaign rollback completed
   ```

4. **RESTAURA las credenciales correctas**:
   ```bash
   npx prisma db seed
   ```

---

## ✅ Checklist de Éxito

Marca cada ítem cuando lo completes:

- [ ] Migración de Prisma ejecutada sin errores
- [ ] Servidor iniciado correctamente
- [ ] Diagnóstico ejecutado exitosamente
- [ ] Screenshot del diagnóstico guardado
- [ ] Ambas cuentas Tonic muestran "HEALTHY"
- [ ] Se identificó qué cuenta soporta RSOC
- [ ] Se identificó qué cuenta soporta Display
- [ ] Test 1 (Meta) completado exitosamente
- [ ] Test 2 (Verificar caché) completado exitosamente
- [ ] Test 3 (TikTok) completado exitosamente
- [ ] Base de datos muestra capacidades cacheadas
- [ ] Los logs muestran "✅ Using CACHED capabilities"
- [ ] NO aparece el error "You are not allowed to create a campaign"

---

## 📊 Qué Reportar

Si todo funciona correctamente, comparte:

1. ✅ Screenshot del diagnóstico
2. ✅ Logs de la creación de campaña exitosa
3. ✅ Query de la base de datos mostrando el caché

Si algo falla, comparte:

1. ❌ Screenshot del error
2. ❌ Logs completos desde el inicio
3. ❌ Output del diagnóstico
4. ❌ Query de la base de datos
5. ❌ Descripción de qué paso falló

---

## 🎯 Resultados Esperados

Al finalizar estas pruebas:

✅ **El error "You are not allowed to create a campaign" NO debe aparecer**
✅ **Las capacidades se cachean en la base de datos**
✅ **El caché persiste entre reinicios**
✅ **El sistema detecta automáticamente RSOC vs Display**
✅ **Los mensajes de error son claros si algo falla**
✅ **El rollback funciona correctamente en caso de error**

---

## 🚀 Siguiente Paso

Si todas las pruebas pasan, ¡el fix está completo! 🎉

Puedes continuar con:

- **FASE 2**: Mejorar UI según `ContextoSheet.png`
- **FASE 3**: Implementar polling de artículos RSOC
- **FASE 4**: Dashboard de monitoreo

O si prefieres, mantener la aplicación como está y empezar a usarla para crear campañas reales.

---

**¿Preguntas?** Comparte los resultados del diagnóstico y los logs, y te ayudaré a interpretar cualquier problema.
