
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accounts = await prisma.account.findMany({
        where: {
            accountType: 'META',
        },
        orderBy: {
            name: 'asc',
        },
    });

    console.log('\n--- Meta Ad Accounts in Database ---');
    accounts.forEach((acc) => {
        console.log(`Name: ${acc.name}`);
        console.log(`ID: ${acc.id}`);
        console.log(`Ad Account ID: ${acc.metaAdAccountId}`);
        console.log(`Current Page ID: ${acc.metaPageId || 'Not set'}`);
        console.log('---');
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
