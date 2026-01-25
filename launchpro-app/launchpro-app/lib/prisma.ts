import { PrismaClient, Prisma } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting database connections due to hot reloading in Next.js
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // ============================================
  // AUDIT MIDDLEWARE: Track all Campaign status changes
  // ============================================
  client.$use(async (params: Prisma.MiddlewareParams, next) => {
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

export const prisma = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
