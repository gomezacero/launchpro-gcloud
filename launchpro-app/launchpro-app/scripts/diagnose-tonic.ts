
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

async function main() {
    console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.blue}║  LaunchPro - Tonic Account Capability Diagnostic     ║${colors.reset}`);
    console.log(`${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}`);

    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
        console.log(`\n${colors.red}❌ ERROR: DATABASE_URL not found in environment variables.${colors.reset}`);
        console.log(`${colors.yellow}💡 Suggestion: Create a .env file with your Supabase connection string:${colors.reset}`);
        console.log(`   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"`);
        process.exit(1);
    } else {
        // Mask password
        const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@');
        console.log(`${colors.cyan}Using DATABASE_URL: ${maskedUrl}${colors.reset}`);
    }

    console.log(`\n${colors.cyan}Connecting to database...${colors.reset}`);
    const prisma = new PrismaClient();

    try {
        // Fetch all accounts that have Tonic credentials
        const accounts = await prisma.account.findMany({
            where: {
                AND: [
                    { tonicConsumerKey: { not: null } },
                    { tonicConsumerKey: { not: '' } },
                ],
            },
            select: {
                id: true,
                name: true,
                tonicConsumerKey: true,
                tonicConsumerSecret: true,
                tonicSupportsRSOC: true,     // To check what's currently cached
                tonicSupportsDisplay: true,  // To check what's currently cached
            },
        });

        console.log(`${colors.green}✅ Found ${accounts.length} potential Tonic account(s).${colors.reset}`);

        if (accounts.length === 0) {
            console.log(`${colors.yellow}⚠️ No accounts found with Tonic credentials in the database.${colors.reset}`);
            return;
        }

        for (const account of accounts) {
            console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
            console.log(`${colors.blue}  Analyzing Account: ${account.name}${colors.reset}`);
            console.log(`${colors.blue}  (ID: ${account.id})${colors.reset}`);
            console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

            // 1. Log Cache State
            console.log(`${colors.cyan}💾 Current DB Cache State:${colors.reset}`);
            console.log(`   - Supports RSOC:    ${account.tonicSupportsRSOC === null ? 'NULL (Never checked)' : account.tonicSupportsRSOC}`);
            console.log(`   - Supports Display: ${account.tonicSupportsDisplay === null ? 'NULL (Never checked)' : account.tonicSupportsDisplay}`);

            if (!account.tonicConsumerKey || !account.tonicConsumerSecret) {
                console.log(`${colors.red}❌ Missing credentials (key/secret)${colors.reset}`);
                continue;
            }

            // 2. Authenticate
            console.log(`\n${colors.cyan}🔐 Authenticating with Tonic API...${colors.reset}`);
            let token = '';
            try {
                const authRes = await axios.post('https://api.publisher.tonic.com/jwt/authenticate', {
                    consumer_key: account.tonicConsumerKey,
                    consumer_secret: account.tonicConsumerSecret,
                });
                token = authRes.data.token;
                console.log(`${colors.green}✅ Authentication successful!${colors.reset}`);
            } catch (error: any) {
                console.log(`${colors.red}❌ Authentication Failed:${colors.reset} ${error.message}`);
                if (error.response) {
                    console.log(`   Status: ${error.response.status}`);
                    console.log(`   Data: ${JSON.stringify(error.response.data)}`);
                }
                continue; // Skip to next account
            }

            const client = axios.create({
                baseURL: 'https://api.publisher.tonic.com',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            // 3. Check RSOC Capability (getRSOCDomains)
            console.log(`\n${colors.cyan}🔍 Checking RSOC Capability (GET /privileged/v3/rsoc/domains)...${colors.reset}`);
            let rsocCapable = false;
            let rsocDomainsFound = 0;
            try {
                const rsocRes = await client.get('/privileged/v3/rsoc/domains');
                const domains = rsocRes.data;
                if (Array.isArray(domains) && domains.length > 0) {
                    console.log(`${colors.green}✅ RSOC ENABLED - Found ${domains.length} domain(s)${colors.reset}`);
                    domains.forEach((d: any) => {
                        console.log(`   - Domain: ${d.domain} (Langs: ${d.languages?.join(', ')})`);
                    });
                    rsocCapable = true;
                    rsocDomainsFound = domains.length;
                } else {
                    console.log(`${colors.yellow}⚠️ RSOC DISABLED - API returned empty list or no domains.${colors.reset}`);
                    console.log(`   Response: ${JSON.stringify(domains)}`);
                }
            } catch (error: any) {
                console.log(`${colors.red}❌ RSOC Check Error:${colors.reset} ${error.message}`);
                if (error.response) console.log(`   Status: ${error.response.status}`);
            }

            // 4. Check Display Capability (getOffers type=display)
            console.log(`\n${colors.cyan}🔍 Checking Display Capability (GET /privileged/v3/offers/list?type=display)...${colors.reset}`);
            let displayCapable = false;
            let displayOffersFound = 0;
            try {
                const displayRes = await client.get('/privileged/v3/offers/list', { params: { type: 'display', output: 'json' } });
                const offers = displayRes.data;

                if (Array.isArray(offers) && offers.length > 0) {
                    console.log(`${colors.green}✅ DISPLAY OFFERS FOUND - Found ${offers.length} offer(s)${colors.reset}`);
                    console.log(`   First offer: ${JSON.stringify(offers[0])}`);
                    displayCapable = true;
                    displayOffersFound = offers.length;
                } else {
                    console.log(`${colors.yellow}⚠️ DISPLAY DISABLED - API returned empty list.${colors.reset}`);
                    console.log(`   Response: ${JSON.stringify(offers)}`);
                }
            } catch (error: any) {
                console.log(`${colors.red}❌ Display Check Error:${colors.reset} ${error.message}`);
                if (error.response) console.log(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }

            // 5. DIAGNOSIS
            console.log(`\n${colors.blue}📊 DIAGNOSIS FOR ${account.name}:${colors.reset}`);

            const supportsRSOC = rsocCapable;
            // CRITICAL: Just having display offers doesn't mean you can CREATE display campaigns.
            // But Orchestrator assumes: supportsDisplay = displayOffers > 0
            const supportsDisplay = displayCapable;

            console.log(`   Orchestrator calculated capabilities:`);
            console.log(`   - RSOC:    ${supportsRSOC ? colors.green + 'YES' : colors.red + 'NO'}${colors.reset}`);
            console.log(`   - Display: ${supportsDisplay ? colors.green + 'YES' : colors.red + 'NO'}${colors.reset}`);

            if (supportsRSOC) {
                console.log(`\n   ${colors.green}✅ System will choose 'rsoc' for new campaigns.${colors.reset}`);
            } else if (supportsDisplay) {
                console.log(`\n   ${colors.yellow}⚠️ System will fallback to 'display' for new campaigns.${colors.reset}`);
                console.log(`   IF your account is NOT allowed to create display campaigns, this is why it fails.`);
                console.log(`   Error "You are not allowed to create campaigns of this type" confirms this mismatch.`);
            } else {
                console.log(`\n   ${colors.red}❌ System cannot determine a valid campaign type.${colors.reset}`);
            }

        } // End account loop

    } catch (error: any) {
        console.error(`\n${colors.red}❌ Unexpected Error:${colors.reset}`, error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
