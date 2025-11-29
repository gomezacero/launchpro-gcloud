require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return val.toString();
  if (val instanceof Date) return `'${val.toISOString()}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function main() {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { accountType: 'asc' }
  });

  let sql = '-- Accounts Insert Script for Supabase\n';
  sql += '-- Generated from local database\n\n';

  for (const acc of accounts) {
    sql += `INSERT INTO "Account" (
  "id", "name", "accountType",
  "tonicConsumerKey", "tonicConsumerSecret", "tonicJwtToken", "tonicTokenExpiry",
  "tonicSupportsRSOC", "tonicSupportsDisplay", "tonicRSOCDomains", "tonicCapabilitiesLastChecked",
  "metaAdAccountId", "metaPortfolio", "metaPageId", "metaAccessToken", "metaPixelId",
  "tiktokAdvertiserId", "tiktokAccessToken", "tiktokPixelId",
  "linkedTonicAccountId", "isActive", "createdAt", "updatedAt"
) VALUES (
  ${escapeSQL(acc.id)}, ${escapeSQL(acc.name)}, '${acc.accountType}',
  ${escapeSQL(acc.tonicConsumerKey)}, ${escapeSQL(acc.tonicConsumerSecret)}, ${escapeSQL(acc.tonicJwtToken)}, ${escapeSQL(acc.tonicTokenExpiry)},
  ${escapeSQL(acc.tonicSupportsRSOC)}, ${escapeSQL(acc.tonicSupportsDisplay)}, ${acc.tonicRSOCDomains ? `'${JSON.stringify(acc.tonicRSOCDomains)}'` : 'NULL'}, ${escapeSQL(acc.tonicCapabilitiesLastChecked)},
  ${escapeSQL(acc.metaAdAccountId)}, ${escapeSQL(acc.metaPortfolio)}, ${escapeSQL(acc.metaPageId)}, ${escapeSQL(acc.metaAccessToken)}, ${escapeSQL(acc.metaPixelId)},
  ${escapeSQL(acc.tiktokAdvertiserId)}, ${escapeSQL(acc.tiktokAccessToken)}, ${escapeSQL(acc.tiktokPixelId)},
  ${escapeSQL(acc.linkedTonicAccountId)}, true, NOW(), NOW()
);\n\n`;
  }

  fs.writeFileSync('accounts_insert.sql', sql);
  console.log('SQL file created: accounts_insert.sql');
  console.log(`Total accounts: ${accounts.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
