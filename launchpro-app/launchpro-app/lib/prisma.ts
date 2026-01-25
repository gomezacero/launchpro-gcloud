import { PrismaClient, Prisma } from '@prisma/client';

// Create a new PrismaClient with audit middleware
const createPrismaClient = () => {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Middleware to track Campaign status changes - saves to database
  client.$use(async (params: Prisma.MiddlewareParams, next) => {
    // Only intercept Campaign updates with status changes
    if (
      params.model === 'Campaign' &&
      (params.action === 'update' || params.action === 'updateMany') &&
      params.args?.data?.status
    ) {
      const newStatus = params.args.data.status;
      const campaignId = params.args?.where?.id || 'BULK';

      // Get caller info from stack trace
      const stack = new Error().stack || '';
      const callerLines = stack.split('\n').slice(2, 6).map(l => l.trim()).join(' | ');

      // Execute the update first
      const result = await next(params);

      // Then log to database (fire and forget - don't block)
      try {
        await client.$executeRaw`
          INSERT INTO "CampaignAuditLog" (id, "campaignId", "newStatus", action, caller, timestamp)
          VALUES (
            ${`audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`},
            ${campaignId},
            ${newStatus},
            ${params.action},
            ${callerLines.substring(0, 500)},
            NOW()
          )
        `;
      } catch (auditError) {
        console.error('[AUDIT] Failed to log:', auditError);
      }

      return result;
    }

    return next(params);
  });

  return client;
};

// In production: ALWAYS create fresh client to ensure middleware is attached
// In development: Cache to prevent connection exhaustion during hot reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  process.env.NODE_ENV === 'production'
    ? createPrismaClient()  // Always fresh in production
    : (globalForPrisma.prisma ?? (globalForPrisma.prisma = createPrismaClient()));

export default prisma;
