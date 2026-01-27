/**
 * Fix Orphan Campaigns Script
 *
 * This script fixes campaigns that are stuck in ARTICLE_APPROVED or FAILED status
 * because they are missing the trackingLinkPollingStartedAt field.
 *
 * The missing field causes continueCampaignAfterArticle() to skip processing.
 *
 * NOTE: The 401 Anthropic errors were caused by OLD CACHED CODE, not this field.
 * As of v2.9.3, all AI generation uses GEMINI exclusively.
 *
 * Usage:
 *   npx tsx scripts/fix-orphan-campaigns.ts
 *
 * v2.9.1: Created to resolve orphan campaign issue
 * v2.9.3: Updated comments - 401 issue was from old cached code, not this field
 */

import { PrismaClient, CampaignStatus, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function fixOrphanCampaigns() {
  console.log('🔍 Buscando campañas huérfanas (missing trackingLinkPollingStartedAt)...\n');

  // Find campaigns that have tracking link but missing the polling started timestamp
  const orphans = await prisma.campaign.findMany({
    where: {
      status: { in: [CampaignStatus.ARTICLE_APPROVED, CampaignStatus.FAILED] },
      trackingLinkPollingStartedAt: null,
      tonicTrackingLink: { not: null }
    },
    select: {
      id: true,
      name: true,
      status: true,
      tonicTrackingLink: true,
      createdAt: true
    }
  });

  if (orphans.length === 0) {
    console.log('✅ No se encontraron campañas huérfanas. Todo está bien!\n');
    return;
  }

  console.log(`📋 Encontradas ${orphans.length} campañas huérfanas:\n`);

  for (const campaign of orphans) {
    console.log(`  - ${campaign.name}`);
    console.log(`    ID: ${campaign.id}`);
    console.log(`    Status: ${campaign.status}`);
    console.log(`    Tracking Link: ${campaign.tonicTrackingLink?.substring(0, 50)}...`);
    console.log(`    Created: ${campaign.createdAt.toISOString()}`);
    console.log('');
  }

  console.log('🔧 Arreglando campañas...\n');

  for (const campaign of orphans) {
    try {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          trackingLinkPollingStartedAt: new Date(),
          // If campaign is FAILED, reset to ARTICLE_APPROVED so it can be reprocessed
          status: campaign.status === CampaignStatus.FAILED
            ? CampaignStatus.ARTICLE_APPROVED
            : campaign.status,
          // Clear any error details from previous failures
          errorDetails: Prisma.DbNull
        }
      });

      const newStatus = campaign.status === CampaignStatus.FAILED
        ? 'ARTICLE_APPROVED (reset from FAILED)'
        : campaign.status;

      console.log(`  ✅ Arreglada: ${campaign.name}`);
      console.log(`     Nuevo status: ${newStatus}`);
      console.log(`     trackingLinkPollingStartedAt: ${new Date().toISOString()}`);
      console.log('');
    } catch (error) {
      console.error(`  ❌ Error arreglando ${campaign.name}: ${error}`);
    }
  }

  console.log('🎉 Migración completada!\n');
  console.log('Las campañas arregladas ahora pueden ser procesadas por el cron process-campaigns.');
  console.log('Monitorea los logs de Vercel para verificar que se procesen correctamente.\n');
}

async function showStats() {
  console.log('📊 Estadísticas de campañas:\n');

  const stats = await prisma.campaign.groupBy({
    by: ['status'],
    _count: { id: true }
  });

  for (const stat of stats) {
    console.log(`  ${stat.status}: ${stat._count.id}`);
  }
  console.log('');

  // Count campaigns with/without trackingLinkPollingStartedAt
  const withPolling = await prisma.campaign.count({
    where: { trackingLinkPollingStartedAt: { not: null } }
  });
  const withoutPolling = await prisma.campaign.count({
    where: { trackingLinkPollingStartedAt: null }
  });

  console.log(`  Con trackingLinkPollingStartedAt: ${withPolling}`);
  console.log(`  Sin trackingLinkPollingStartedAt: ${withoutPolling}`);
  console.log('');
}

async function main() {
  try {
    console.log('\n========================================');
    console.log('  Fix Orphan Campaigns Script v2.9.1');
    console.log('========================================\n');

    await showStats();
    await fixOrphanCampaigns();
    await showStats();

  } catch (error) {
    console.error('❌ Error ejecutando script:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
