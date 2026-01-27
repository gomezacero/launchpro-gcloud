/**
 * Diagnostic Script: 401 Anthropic Error
 *
 * This script helps diagnose why you might be seeing 401 Anthropic errors
 * when the codebase has been migrated to Gemini.
 *
 * Usage:
 *   npx tsx scripts/diagnose-401-error.ts
 *
 * v2.9.3: Created for debugging 401 errors
 */

import * as fs from 'fs';
import * as path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color: string, msg: string) {
  console.log(`${color}${msg}${RESET}`);
}

async function main() {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('  LaunchPro 401 Error Diagnostic Tool');
  console.log('  Version: v2.9.3');
  console.log('='.repeat(80));
  console.log('\n');

  let issues: string[] = [];
  let warnings: string[] = [];
  let successes: string[] = [];

  // 1. Check if @anthropic-ai/sdk is installed
  console.log(BLUE + '1. Checking for Anthropic SDK...' + RESET);
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  if (packageJson.dependencies?.['@anthropic-ai/sdk'] || packageJson.devDependencies?.['@anthropic-ai/sdk']) {
    issues.push('@anthropic-ai/sdk is in package.json - REMOVE IT');
  } else {
    successes.push('@anthropic-ai/sdk is NOT in package.json');
  }

  // Check node_modules
  const anthropicModulePath = path.join(__dirname, '..', 'node_modules', '@anthropic-ai');
  if (fs.existsSync(anthropicModulePath)) {
    issues.push('@anthropic-ai exists in node_modules - Run: rm -rf node_modules && npm install');
  } else {
    successes.push('@anthropic-ai is NOT in node_modules');
  }

  // 2. Check environment variables
  console.log(BLUE + '2. Checking environment variables...' + RESET);

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicKey) {
    warnings.push('ANTHROPIC_API_KEY is set - This is not used by current code, consider removing it');
  }

  if (!geminiKey) {
    issues.push('GEMINI_API_KEY or GOOGLE_AI_API_KEY is NOT set - Required for AI generation');
  } else if (geminiKey.startsWith('sk-ant')) {
    issues.push('GEMINI_API_KEY starts with "sk-ant" which is an Anthropic key format! Please use a valid Google Gemini API key.');
  } else {
    successes.push('GEMINI_API_KEY is set and appears to be valid');
  }

  // 3. Check for .next directory (build cache)
  console.log(BLUE + '3. Checking build cache...' + RESET);
  const nextDir = path.join(__dirname, '..', '.next');
  if (fs.existsSync(nextDir)) {
    const nextBuildId = path.join(nextDir, 'BUILD_ID');
    if (fs.existsSync(nextBuildId)) {
      const buildId = fs.readFileSync(nextBuildId, 'utf-8').trim();
      warnings.push(`.next directory exists with BUILD_ID: ${buildId}. Consider deleting and rebuilding to ensure fresh code.`);
    } else {
      warnings.push('.next directory exists but no BUILD_ID. Consider deleting and rebuilding.');
    }
  } else {
    successes.push('.next directory does not exist (clean state)');
  }

  // 4. Verify AI service version
  console.log(BLUE + '4. Verifying AI service version...' + RESET);
  const aiServicePath = path.join(__dirname, '..', 'services', 'ai.service.ts');
  const aiServiceContent = fs.readFileSync(aiServicePath, 'utf-8');

  const versionMatch = aiServiceContent.match(/const AI_SERVICE_VERSION = ['"]([^'"]+)['"]/);
  if (versionMatch) {
    const version = versionMatch[1];
    if (version.includes('GEMINI') && !version.includes('ANTHROPIC')) {
      successes.push(`AI Service version: ${version} (Gemini-only)`);
    } else {
      issues.push(`AI Service version ${version} may still use Anthropic`);
    }
  }

  // Check for any Anthropic imports
  if (aiServiceContent.includes("from '@anthropic-ai/sdk'") || aiServiceContent.includes("from \"@anthropic-ai/sdk\"")) {
    issues.push('ai.service.ts contains import from @anthropic-ai/sdk - Code is outdated!');
  } else {
    successes.push('ai.service.ts does NOT import from @anthropic-ai/sdk');
  }

  // 5. Search for Anthropic calls in key files
  console.log(BLUE + '5. Scanning for Anthropic API calls...' + RESET);
  const filesToCheck = [
    'services/ai.service.ts',
    'services/campaign-orchestrator.service.ts',
    'app/api/cron/process-campaigns/route.ts',
  ];

  for (const file of filesToCheck) {
    const filePath = path.join(__dirname, '..', file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('api.anthropic.com') || content.includes('this.anthropic.')) {
        issues.push(`${file} contains Anthropic API calls - Code is outdated!`);
      } else {
        successes.push(`${file} does NOT contain Anthropic API calls`);
      }
    }
  }

  // Print results
  console.log('\n');
  console.log('='.repeat(80));
  console.log('  DIAGNOSTIC RESULTS');
  console.log('='.repeat(80));
  console.log('\n');

  if (successes.length > 0) {
    log(GREEN, '✅ GOOD:');
    for (const s of successes) {
      console.log(`   ${s}`);
    }
    console.log('');
  }

  if (warnings.length > 0) {
    log(YELLOW, '⚠️  WARNINGS:');
    for (const w of warnings) {
      console.log(`   ${w}`);
    }
    console.log('');
  }

  if (issues.length > 0) {
    log(RED, '❌ ISSUES FOUND:');
    for (const i of issues) {
      console.log(`   ${i}`);
    }
    console.log('\n');
    log(RED, '🔧 RECOMMENDED FIX:');
    console.log('   1. Delete the .next directory: rm -rf .next');
    console.log('   2. Delete node_modules: rm -rf node_modules');
    console.log('   3. Reinstall dependencies: npm install');
    console.log('   4. Rebuild: npm run build');
    console.log('   5. For Vercel: Push changes and trigger a new deployment');
    console.log('');
  } else {
    log(GREEN, '🎉 No critical issues found! Your code should be using Gemini only.');
    console.log('');
    console.log('If you are still seeing 401 Anthropic errors:');
    console.log('   1. Vercel may have cached old code - Force a new deployment');
    console.log('   2. You may have multiple processes running - Check for zombie processes');
    console.log('   3. The error may be from old logs - Check the timestamp of the error');
    console.log('');
  }
}

main().catch(console.error);
