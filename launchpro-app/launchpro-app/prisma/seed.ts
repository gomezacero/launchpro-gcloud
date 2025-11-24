import { PrismaClient, AccountType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================
  // 1. Global Settings
  // ============================================
  console.log('📝 Creating global settings...');

  const globalSettingsData = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    gcpProjectId: process.env.GCP_PROJECT_ID || '',
    gcpStorageBucket: process.env.GCP_STORAGE_BUCKET || '',
    gcpLocation: process.env.GCP_LOCATION || 'us-central1',
    metaAppId: '1335292061146086',
    metaAppSecret: '40f2e75146149b8eed8f1485824e2d11',
    metaAccessToken: 'EAASZBcOj52ZBYBPCOdF9TaIBXAFLjIJSkFJIUi0lDVsZCylYZB5b723r5sk9KzOU8aTJ81Us2f8PZCz9LnZA58VoVf3zpFsaoVEKBzdZAZB5bCZC7SmMvZBU1GzZB9MG5zOC42c6Gw5APZBXy338uaxWvFMAzzZASDoZBCMnqMMTZC6G9U7JWwxCe7ObNBr9iCf41aI',
    tiktokAccessToken: 'c395c4e5628f728dd794bb4950d9339da06a3886', // App token with full permissions
  };

  await prisma.globalSettings.upsert({
    where: { id: 'global-settings' },
    update: globalSettingsData, // ALWAYS update with latest values
    create: {
      id: 'global-settings',
      ...globalSettingsData,
    },
  });

  // ============================================
  // 2. Tonic Accounts
  // ============================================
  console.log('🎯 Creating Tonic accounts...');

  const tonicTikTok = await prisma.account.upsert({
    where: { accountType_name: { accountType: AccountType.TONIC, name: 'Tonic TikTok' } },
    update: {},
    create: {
      name: 'Tonic TikTok',
      accountType: AccountType.TONIC,
      tonicConsumerKey: '805310f600a835c721a40f06539174a7953a97c9abff3b1d759c10e9fb5c308a',
      tonicConsumerSecret: '66ae4d352dd61deec690a98c7914d1dc59fc76a2d132338e61f4ac2b57bed98a',
      isActive: true,
    },
  });

  const tonicMeta = await prisma.account.upsert({
    where: { accountType_name: { accountType: AccountType.TONIC, name: 'Tonic Meta' } },
    update: {},
    create: {
      name: 'Tonic Meta',
      accountType: AccountType.TONIC,
      tonicConsumerKey: 'e9866aee9d040f1e983ecdfb2b83a0a394766ad266f59cd335ea44409abfa943',
      tonicConsumerSecret: '270bcd9d4b40eacb9c19cf7e0c4b96228b67427c18a86a6f12ffebbe6986dc8b',
      isActive: true,
    },
  });

  // ============================================
  // 3. Meta Accounts (3 Portfolios)
  // ============================================
  console.log('📘 Creating Meta accounts...');

  // Portfolio: Capital Quick LLC
  const metaCapitalB1 = await prisma.account.upsert({
    where: { accountType_name: { accountType: AccountType.META, name: 'Capital Quick LLC - B1' } },
    update: {},
    create: {
      name: 'Capital Quick LLC - B1',
      accountType: AccountType.META,
      metaAdAccountId: 'act_641975565566309',
      metaPortfolio: 'Capital Quick LLC',
      isActive: true,
    },
  });

  const metaCapitalA1 = await prisma.account.upsert({
    where: { accountType_name: { accountType: AccountType.META, name: 'Capital Quick LLC - A1' } },
    update: {},
    create: {
      name: 'Capital Quick LLC - A1',
      accountType: AccountType.META,
      metaAdAccountId: 'act_677352071396973',
      metaPortfolio: 'Capital Quick LLC',
      isActive: true,
    },
  });

  // Portfolio: Global Qreate
  await prisma.account.createMany({
    data: [
      {
        name: 'Global Qreate - J2',
        accountType: AccountType.META,
        metaAdAccountId: 'act_3070045536479246',
        metaPortfolio: 'Global Qreate',
        isActive: true,
      },
      {
        name: 'Global Qreate - L2',
        accountType: AccountType.META,
        metaAdAccountId: 'act_614906531545813',
        metaPortfolio: 'Global Qreate',
        isActive: true,
      },
      {
        name: 'Global Qreate - M2',
        accountType: AccountType.META,
        metaAdAccountId: 'act_1780161402845930',
        metaPortfolio: 'Global Qreate',
        isActive: true,
      },
      {
        name: 'Global Qreate - S2',
        accountType: AccountType.META,
        metaAdAccountId: 'act_1165341668311653',
        metaPortfolio: 'Global Qreate',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  // Portfolio: Quick Enterprise LLC
  await prisma.account.createMany({
    data: [
      {
        name: 'Quick Enterprise LLC - H (RSOC Tonic)',
        accountType: AccountType.META,
        metaAdAccountId: 'act_1737933370083513',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - Q (RSOC Maximizer)',
        accountType: AccountType.META,
        metaAdAccountId: 'act_2022331814769761',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - S',
        accountType: AccountType.META,
        metaAdAccountId: 'act_1444017220319861',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - X',
        accountType: AccountType.META,
        metaAdAccountId: 'act_281103568151537',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - Y (RSOC Tonic)',
        accountType: AccountType.META,
        metaAdAccountId: 'act_1441113960393075',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - Z',
        accountType: AccountType.META,
        metaAdAccountId: 'act_2649101458607642',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - R (RSOC Tonic)',
        accountType: AccountType.META,
        metaAdAccountId: 'act_721173856973839',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
      {
        name: 'Quick Enterprise LLC - B1 (RSOC Tonic)',
        accountType: AccountType.META,
        metaAdAccountId: 'act_641975565566309',
        metaPortfolio: 'Quick Enterprise LLC',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  // ============================================
  // 4. TikTok Accounts
  // ============================================
  console.log('🎵 Creating TikTok accounts...');

  const tiktokAccounts = [
    { name: 'TX-1', advertiserId: '7476563770333167633' },
    { name: 'TG-JM', advertiserId: '7420431043557228561' },
    { name: 'TQ-Les', advertiserId: '7426429239521640449' },
    { name: 'TY-Capital', advertiserId: '7396000534140026897' },
    { name: 'TA', advertiserId: '7478364576418201617' },
  ];

  for (const account of tiktokAccounts) {
    await prisma.account.upsert({
      where: { accountType_name: { accountType: AccountType.TIKTOK, name: `TikTok ${account.name}` } },
      update: {},
      create: {
        name: `TikTok ${account.name}`,
        accountType: AccountType.TIKTOK,
        tiktokAdvertiserId: account.advertiserId,
        isActive: true,
      },
    });
  }

  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log('  - 2 Tonic accounts');
  console.log('  - 14 Meta accounts (3 portfolios)');
  console.log('  - 5 TikTok accounts');
  console.log('');
  console.log('🎉 Ready to launch campaigns!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
