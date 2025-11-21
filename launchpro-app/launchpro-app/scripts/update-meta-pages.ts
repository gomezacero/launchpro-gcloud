
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of Meta Ad Account ID (act_...) to Facebook Page ID
// Based on user provided list. Using the first page listed for each account.
const AD_ACCOUNT_PAGE_MAPPING: { [key: string]: string } = {
    // Capital Quick LLC
    'act_677352071396973': '507208532486644', // A1 -> Mis Autos

    // Global Qreate
    'act_614906531545813': '344612025394538', // L2 -> Capital Home
    'act_1165341668311653': '516964821493390', // S2 -> Jobs and Hiring

    // Quick Enterprise LLC
    'act_1737933370083513': '468521079683916', // H -> Moto GPS
    'act_2022331814769761': '298538410018963', // Q -> Flash Cars
    'act_1444017220319861': '491157670746517', // S -> La Guia de los Autos
    'act_281103568151537': '492042913993137', // X -> Auto & Speed
    'act_1441113960393075': '468388966355602', // Y -> Hogar Tech
    'act_2649101458607642': '373400445866005', // Z -> Daily Tips
};

async function main() {
    console.log('Updating Meta Page IDs...');

    for (const [adAccountId, pageId] of Object.entries(AD_ACCOUNT_PAGE_MAPPING)) {
        try {
            const result = await prisma.account.updateMany({
                where: {
                    metaAdAccountId: adAccountId,
                },
                data: {
                    metaPageId: pageId,
                },
            });

            if (result.count > 0) {
                console.log(`✅ Updated account ${adAccountId} with Page ID ${pageId}`);
            } else {
                console.log(`⚠️  Account ${adAccountId} not found in DB`);
            }
        } catch (error) {
            console.error(`❌ Failed to update ${adAccountId}:`, error);
        }
    }

    console.log('\n--- Summary ---');
    console.log('The following accounts had NO pages and were skipped:');
    console.log('- B1 (act_641975565566309)');
    console.log('- J2 (act_3070045536479246)');
    console.log('- M2 (act_1780161402845930)');
    console.log('- R (act_721173856973839)');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
