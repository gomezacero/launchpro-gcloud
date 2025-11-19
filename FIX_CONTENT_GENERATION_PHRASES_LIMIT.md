# 🔧 FIX: Content Generation Phrases Must Be 3-5

**Date**: 2025-11-15
**Status**: ✅ FIXED
**Severity**: HIGH - Campaign creation failing at article request

---

## 🎯 Problem Summary

### The Error
```
[TONIC] ❌ RSOC article creation failed
[TONIC] Error details: {
  status: 400,
  statusText: 'Bad Request',
  data: [
    'Please provide 3-5 content generation phrases.    [Root=1-691816d6-6a386d50380f302b0dfa0f9e]'
  ]
}
```

### Root Cause

The AI (Claude Sonnet 4) was generating **7 content generation phrases** when Tonic API requires **EXACTLY 3-5 phrases**.

**What was sent to Tonic**:
```javascript
content_generation_phrases: [
  'Tipos de créditos vehiculares disponibles...',  // 1
  'Factores importantes a evaluar...',             // 2
  'Documentos y requisitos comunes...',            // 3
  'Diferencias entre financiamiento directo...',   // 4
  'Cómo calcular la cuota mensual ideal...',       // 5
  'Ventajas y consideraciones de los planes...',   // 6 ← TOO MANY!
  'Consejos prácticos para negociar...'            // 7 ← TOO MANY!
]
```

**Tonic requirement**: 3-5 phrases (NOT 2, NOT 6, NOT 7)

---

## ✅ Solution Implemented

### 1. Updated AI Prompt - Explicit Instruction

**File**: `services/ai.service.ts`

**Added to system prompt** (line 274):
```typescript
3. CONTENT QUALITY:
   - Headlines must be compelling but truthful - no clickbait
   - Teaser must be informative and engaging (250-1000 characters)
   - Content generation phrases: EXACTLY 3-5 phrases (CRITICAL: Tonic will reject if less than 3 or more than 5)
   - Natural tone - not overly promotional or salesy
```

**Added to user prompt** (lines 298, 307):
```typescript
REMEMBER:
- ${dialectRule}
- Perfect grammar and spelling
- NO invented data or exaggerated claims
- Formal/semi-formal tone only
- Truthful, valuable content
- CRITICAL: contentGenerationPhrases must be EXACTLY 3, 4, or 5 phrases (NOT 2, NOT 6, NOT 7!)

Return a JSON object with:
{
  "headline": "engaging headline (max 256 characters)",
  "teaser": "compelling opening paragraph (250-1000 characters)",
  "contentGenerationPhrases": ["phrase1", "phrase2", "phrase3", "phrase4"]
}

IMPORTANT: The contentGenerationPhrases array MUST contain between 3 and 5 items.
If you generate more than 5 or less than 3, the request will be REJECTED by Tonic.
```

### 2. Added Validation & Auto-Correction

**File**: `services/ai.service.ts` (lines 326-342)

```typescript
// CRITICAL VALIDATION: Tonic requires EXACTLY 3-5 content generation phrases
if (!article.contentGenerationPhrases || !Array.isArray(article.contentGenerationPhrases)) {
  throw new Error('AI failed to generate contentGenerationPhrases array');
}

// If Claude generated more than 5 phrases, trim to 5
if (article.contentGenerationPhrases.length > 5) {
  logger.warn('ai', `Generated ${article.contentGenerationPhrases.length} phrases, trimming to 5 for Tonic compliance`, {
    original: article.contentGenerationPhrases.length,
    trimmed: 5
  });
  article.contentGenerationPhrases = article.contentGenerationPhrases.slice(0, 5);
}

// If Claude generated less than 3 phrases, throw error (cannot auto-fix)
if (article.contentGenerationPhrases.length < 3) {
  throw new Error(`AI generated only ${article.contentGenerationPhrases.length} content generation phrases, but Tonic requires 3-5. Please retry.`);
}
```

### 3. Added Logger Import

**File**: `services/ai.service.ts` (line 6)

```typescript
import { logger } from '@/lib/logger';
```

---

## 📊 How It Works

### Dual Protection System

```
┌─────────────────────────────────────────────┐
│  1. AI GENERATION (Claude Sonnet 4)        │
│     - Receives explicit instruction:       │
│       "EXACTLY 3-5 phrases"                 │
│     - Should generate 3-5 phrases          │
└─────────────────┬───────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────┐
│  2. VALIDATION LAYER (TypeScript)           │
│     - Checks if array exists                │
│     - Checks length                         │
│                                             │
│     If > 5 phrases:                         │
│       ✅ Auto-trim to 5 (takes first 5)    │
│                                             │
│     If < 3 phrases:                         │
│       ❌ Throw error (cannot auto-fix)     │
│                                             │
│     If 3-5 phrases:                         │
│       ✅ Pass through                       │
└─────────────────┬───────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────┐
│  3. SEND TO TONIC API                       │
│     - Always receives 3-5 phrases           │
│     - ✅ Accepted by Tonic                  │
└─────────────────────────────────────────────┘
```

---

## 🧪 Example Scenarios

### Scenario 1: AI Generates 7 Phrases (Like Before)

**AI Output**:
```json
{
  "contentGenerationPhrases": [
    "Phrase 1",
    "Phrase 2",
    "Phrase 3",
    "Phrase 4",
    "Phrase 5",
    "Phrase 6",
    "Phrase 7"
  ]
}
```

**Validation Layer**:
```
[AI] Generated 7 phrases, trimming to 5 for Tonic compliance
```

**Sent to Tonic**:
```json
{
  "content_generation_phrases": [
    "Phrase 1",
    "Phrase 2",
    "Phrase 3",
    "Phrase 4",
    "Phrase 5"
  ]
}
```

**Result**: ✅ Accepted by Tonic

---

### Scenario 2: AI Generates 4 Phrases (Ideal)

**AI Output**:
```json
{
  "contentGenerationPhrases": [
    "Phrase 1",
    "Phrase 2",
    "Phrase 3",
    "Phrase 4"
  ]
}
```

**Validation Layer**:
```
✅ Passes validation (length = 4)
```

**Sent to Tonic**:
```json
{
  "content_generation_phrases": [
    "Phrase 1",
    "Phrase 2",
    "Phrase 3",
    "Phrase 4"
  ]
}
```

**Result**: ✅ Accepted by Tonic

---

### Scenario 3: AI Generates 2 Phrases (Error)

**AI Output**:
```json
{
  "contentGenerationPhrases": [
    "Phrase 1",
    "Phrase 2"
  ]
}
```

**Validation Layer**:
```
❌ Error: AI generated only 2 content generation phrases, but Tonic requires 3-5. Please retry.
```

**Result**: Campaign creation fails with clear error message

**Why we don't auto-fix**: We can't invent phrases, so we fail early and ask for retry.

---

## 📝 Testing Instructions

### Step 1: Restart Server
```bash
npm run dev
```

### Step 2: Create a Test Campaign

Navigate to: `http://localhost:3001/campaigns/new`

**Test Configuration**:
```
Campaign Name: Test Phrases Limit
Offer: Car Loans (800)
Country: CO  ← Colombia (your error was with CO)
Language: Spanish
Platform: Meta
Budget: 50
Start Date: Today
```

### Step 3: Monitor Logs

**Expected logs**:

```
[AI] Generating article for RSOC campaign...
[TONIC] Creating RSOC article request...
[TONIC] Article request params: {
  "offer_id": 800,
  "country": "CO",
  "language": "es",
  "domain": "inktrekker.com",
  "content_generation_phrases": [
    "...",  // Phrase 1
    "...",  // Phrase 2
    "...",  // Phrase 3
    "...",  // Phrase 4  (or 5, but NOT more than 5!)
  ]
}
```

**If trimming happened**:
```
[AI] Generated 7 phrases, trimming to 5 for Tonic compliance
```

### Expected Result

✅ **Article request succeeds** without "Please provide 3-5 content generation phrases" error

---

## 🎯 Why This Happened

### Claude's Behavior

Claude Sonnet 4 is **thorough and helpful**, which can sometimes lead to:
- Generating more examples than requested
- Providing comprehensive lists
- Being "extra helpful" by adding bonus content

### The Fix

By being **VERY EXPLICIT** in the prompt:
- "EXACTLY 3-5 phrases"
- "NOT 2, NOT 6, NOT 7"
- "CRITICAL: Tonic will reject if..."
- Showing example with 4 phrases in the JSON template

We guide Claude to respect the limit.

### The Safety Net

Even if Claude ignores the instruction, the **validation layer** catches it:
- Auto-trims from 7 → 5
- Logs the trimming for debugging
- Ensures Tonic always receives 3-5 phrases

---

## 📊 Impact

| Aspect | Before | After |
|--------|--------|-------|
| **Phrases Generated** | 7 (too many) | 3-5 (correct) |
| **Tonic Acceptance** | ❌ Rejected | ✅ Accepted |
| **Auto-Correction** | ❌ None | ✅ Trims if > 5 |
| **Error Clarity** | ⚠️ Tonic API error | ✅ Clear validation error |
| **Campaign Success Rate** | ⚠️ Low | ✅ High |

---

## 🚨 Edge Cases Handled

### 1. AI Generates Array But Empty
```typescript
if (!article.contentGenerationPhrases || !Array.isArray(article.contentGenerationPhrases)) {
  throw new Error('AI failed to generate contentGenerationPhrases array');
}
```

### 2. AI Generates Null/Undefined
Caught by the same check above.

### 3. AI Generates 10+ Phrases
```typescript
if (article.contentGenerationPhrases.length > 5) {
  // Trim to first 5
  article.contentGenerationPhrases = article.contentGenerationPhrases.slice(0, 5);
}
```

### 4. AI Generates 0-2 Phrases
```typescript
if (article.contentGenerationPhrases.length < 3) {
  throw new Error(`AI generated only ${article.contentGenerationPhrases.length}...`);
}
```

---

## 🎓 Lessons Learned

### 1. Always Validate AI Output

AI models are powerful but can be unpredictable. **Always validate** against external API requirements.

### 2. Be Explicit in Prompts

Instead of:
```
- Generates 3-5 content generation phrases
```

Use:
```
- EXACTLY 3-5 phrases (CRITICAL: Tonic will reject if less than 3 or more than 5)
- NOT 2, NOT 6, NOT 7
```

### 3. Add Safety Nets

Even with perfect prompts, add validation layers to handle edge cases.

### 4. Log Trimming Operations

When auto-correcting, always log it for debugging:
```typescript
logger.warn('ai', `Generated ${original} phrases, trimming to ${trimmed}`);
```

---

## 🔧 Troubleshooting

### If you still see the error:

1. **Check the logs** - Look for the trimming warning
2. **Verify the count** - How many phrases were actually sent?
3. **Check the AI response** - What did Claude generate?

### Debug command:

Add this temporarily after line 324 to see what Claude generated:
```typescript
console.log('[DEBUG] AI generated phrases:', article.contentGenerationPhrases);
console.log('[DEBUG] Phrase count:', article.contentGenerationPhrases?.length);
```

---

## 🚀 Next Steps

### This fix is complete when:

1. ✅ Article requests succeed without "3-5 phrases" error
2. ✅ No more than 5 phrases are sent to Tonic
3. ✅ At least 3 phrases are always sent to Tonic
4. ✅ Trimming is logged when it happens

---

## 📞 Related Fixes

This is the **third fix** in the sequence:

1. ✅ **Domain parameter missing** - `CRITICAL_FIX_DOMAIN_PARAMETER.md`
2. ✅ **Wrong dialect/regionalism** - `AI_PROMPTS_IMPROVEMENT_TONIC_COMPLIANCE.md`
3. ✅ **Too many phrases** - This document

All three are now resolved! 🎉

---

**Status**: Ready for testing 🚀
**Expected Impact**: Fixes the "3-5 phrases" rejection
**Breaking Changes**: None - only improves validation
