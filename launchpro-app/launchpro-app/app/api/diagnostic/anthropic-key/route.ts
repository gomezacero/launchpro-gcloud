import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * GET /api/diagnostic/anthropic-key
 *
 * Diagnostic endpoint to check the Anthropic API key status.
 * This helps debug authentication errors by showing:
 * - Raw key length
 * - Cleaned key length
 * - Key format validation
 * - Character codes of potentially problematic characters
 * - A test API call to verify the key works
 */
export async function GET(request: NextRequest) {
  try {
    // Get the raw key from environment
    const rawKey = process.env.ANTHROPIC_API_KEY || '';

    // Check for common issues
    const hasLeadingQuote = rawKey.startsWith('"') || rawKey.startsWith("'");
    const hasTrailingQuote = rawKey.endsWith('"') || rawKey.endsWith("'");
    const hasLeadingWhitespace = rawKey !== rawKey.trimStart();
    const hasTrailingWhitespace = rawKey !== rawKey.trimEnd();

    // Clean the key aggressively - also strip quotes
    let cleanedKey = rawKey
      .split('')
      .filter(char => {
        const code = char.charCodeAt(0);
        return (code >= 33 && code <= 126);
      })
      .join('');

    // Remove surrounding quotes if present
    if ((cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) ||
        (cleanedKey.startsWith("'") && cleanedKey.endsWith("'"))) {
      cleanedKey = cleanedKey.slice(1, -1);
    }

    // Find problematic characters
    const problematicChars: { index: number; char: string; code: number }[] = [];
    for (let i = 0; i < rawKey.length; i++) {
      const code = rawKey.charCodeAt(i);
      if (code < 33 || code > 126) {
        problematicChars.push({ index: i, char: rawKey[i], code });
      }
    }

    // Build diagnostic info
    const diagnosticInfo = {
      rawKeyLength: rawKey.length,
      cleanedKeyLength: cleanedKey.length,
      charactersRemoved: rawKey.length - cleanedKey.length,
      keyPreview: cleanedKey ? `${cleanedKey.substring(0, 20)}...${cleanedKey.substring(cleanedKey.length - 6)}` : 'MISSING',
      startsWithSkAnt: cleanedKey.startsWith('sk-ant-'),
      first30CharCodes: rawKey.substring(0, 30).split('').map(c => c.charCodeAt(0)),
      problematicCharacters: problematicChars,
      keyIsEmpty: !cleanedKey,
      // Common issues detected
      issues: {
        hasLeadingQuote,
        hasTrailingQuote,
        hasLeadingWhitespace,
        hasTrailingWhitespace,
        hasSurroundingQuotes: hasLeadingQuote && hasTrailingQuote,
      },
    };

    // If key is valid format, try a simple API call
    let apiTestResult: string;
    if (cleanedKey && cleanedKey.startsWith('sk-ant-')) {
      try {
        const client = new Anthropic({ apiKey: cleanedKey });

        // Try a minimal API call
        const response = await client.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "OK"' }],
        });

        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
        apiTestResult = `SUCCESS: API responded with "${responseText.substring(0, 50)}"`;
      } catch (apiError: any) {
        apiTestResult = `FAILED: ${apiError.status || 'unknown'} - ${apiError.message}`;
      }
    } else {
      apiTestResult = 'SKIPPED: Key is missing or invalid format';
    }

    return NextResponse.json({
      success: true,
      diagnostic: {
        ...diagnosticInfo,
        apiTestResult,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
