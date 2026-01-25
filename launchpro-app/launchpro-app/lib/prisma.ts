import { PrismaClient, Prisma } from '@prisma/client';

// VERSION: Increment this to force recreation of Prisma client
// This ensures all warm function instances get the new middleware
const PRISMA_CLIENT_VERSION = 'v2.2.0-audit-2026-01-25';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting database connections due to hot reloading in Next.js
const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
  prismaVersion?: string;
};

const prismaClientSingleton = () => {
  console.log(`[PRISMA] 🆕 Creating NEW PrismaClient with middleware (version: ${PRISMA_CLIENT_VERSION})`);

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // ============================================
  // AUDIT MIDDLEWARE: Track all Campaign status changes
  // ============================================
  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    // DEBUG: Log ALL Campaign operations to verify middleware is active
    if (params.model === 'Campaign') {
      console.log(`[PRISMA-MW] Campaign operation: action=${params.action}, hasStatus=${!!params.args?.data?.status}`);
    }

    // Only intercept Campaign updates
    if (params.model === 'Campaign' && (params.action === 'update' || params.action === 'updateMany')) {
      const newStatus = params.args?.data?.status;

      // Only log when status is being changed
      if (newStatus) {
        // Capture stack trace to identify the caller
        const stackTrace = new Error().stack || '';
        const callerInfo = stackTrace
          .split('\n')
          .slice(2, 8) // Get relevant stack frames
          .map(line => line.trim())
          .join(' <- ');

        // Get campaign ID(s)
        const campaignId = params.args?.where?.id ||
                          (params.action === 'updateMany' ? 'BULK' : 'UNKNOWN');

        // Create audit log entry
        const auditEntry = {
          timestamp: new Date().toISOString(),
          campaignId,
          action: params.action,
          newStatus,
          caller: callerInfo.substring(0, 500), // Limit length
          processId: `AUDIT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        };

        // Log to console with distinctive marker
        console.log(`\n🔍 [CAMPAIGN-AUDIT] STATUS CHANGE DETECTED:`);
        console.log(`   Campaign: ${campaignId}`);
        console.log(`   New Status: ${newStatus}`);
        console.log(`   Action: ${params.action}`);
        console.log(`   Timestamp: ${auditEntry.timestamp}`);
        console.log(`   Process ID: ${auditEntry.processId}`);
        console.log(`   Caller Stack: ${callerInfo.substring(0, 300)}`);
        console.log(`🔍 [CAMPAIGN-AUDIT] END\n`);

        // Also log as JSON for easier parsing
        console.log(`[CAMPAIGN-AUDIT-JSON] ${JSON.stringify(auditEntry)}`);
      }
    }

    // Continue with the operation
    return next(params);
  });

  return client;
};

// Force recreation if version doesn't match (ensures middleware is applied after deployments)
console.log(`[PRISMA] Module loaded. Global version: ${globalForPrisma.prismaVersion || 'NONE'}, Current version: ${PRISMA_CLIENT_VERSION}`);

const needsRecreation = globalForPrisma.prismaVersion !== PRISMA_CLIENT_VERSION;
const hasExistingClient = !!globalForPrisma.prisma;

console.log(`[PRISMA] needsRecreation=${needsRecreation}, hasExistingClient=${hasExistingClient}`);

if (needsRecreation && globalForPrisma.prisma) {
  console.log(`[PRISMA] ⚠️ Version mismatch! Recreating client with middleware...`);
  // Disconnect old client to clean up connections
  globalForPrisma.prisma.$disconnect().catch(() => {});
}

// ALWAYS create new client if version mismatch, even if no existing client
const shouldCreateNew = needsRecreation || !globalForPrisma.prisma;
console.log(`[PRISMA] shouldCreateNew=${shouldCreateNew}`);

export const prisma = shouldCreateNew ? prismaClientSingleton() : globalForPrisma.prisma;

// Cache in global with version
globalForPrisma.prisma = prisma;
globalForPrisma.prismaVersion = PRISMA_CLIENT_VERSION;

export default prisma;
