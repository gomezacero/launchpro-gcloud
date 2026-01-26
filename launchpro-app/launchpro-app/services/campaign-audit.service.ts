/**
 * Campaign Audit Service
 *
 * Persists detailed audit logs to the database for complete campaign lifecycle visibility.
 * This solves the problem of Vercel logs being limited and hard to search.
 *
 * Usage:
 *   await campaignAudit.log(campaignId, {
 *     event: 'STATUS_CHANGE',
 *     source: 'cron/check-articles',
 *     previousStatus: 'PENDING_ARTICLE',
 *     newStatus: 'AWAITING_TRACKING',
 *     message: 'Article approved by Tonic',
 *     details: { articleId: '123', approvalTime: '2m 30s' }
 *   });
 */

import { prisma } from '@/lib/prisma';
import { CampaignStatus } from '@prisma/client';

export interface AuditLogEntry {
  event: string;           // e.g., 'STATUS_CHANGE', 'API_CALL', 'ERROR', 'CRON_PROCESS'
  source: string;          // e.g., 'POST /api/campaigns', 'cron/check-articles'
  previousStatus?: CampaignStatus | string | null;
  newStatus?: CampaignStatus | string | null;
  message: string;         // Human-readable description
  details?: Record<string, any> | null;
  isError?: boolean;
  errorCode?: string | null;
  errorStack?: string | null;
  durationMs?: number | null;
}

class CampaignAuditService {
  /**
   * Log an audit entry for a campaign
   */
  async log(campaignId: string, entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.campaignAuditLog.create({
        data: {
          campaignId,
          event: entry.event,
          source: entry.source,
          previousStatus: entry.previousStatus || null,
          newStatus: entry.newStatus || null,
          message: entry.message,
          details: entry.details || undefined,
          isError: entry.isError || false,
          errorCode: entry.errorCode || null,
          errorStack: entry.errorStack || null,
          durationMs: entry.durationMs || null,
        },
      });

      // Also log to console for immediate visibility in Vercel logs
      const prefix = entry.isError ? '❌ [AUDIT]' : '📝 [AUDIT]';
      console.log(`${prefix} [${campaignId.substring(0, 8)}...] ${entry.event}: ${entry.message}`);
    } catch (error: any) {
      // Don't let audit logging failures break the main flow
      console.error(`[AUDIT] Failed to log audit entry: ${error.message}`, {
        campaignId,
        event: entry.event,
        error: error.message,
      });
    }
  }

  /**
   * Log a status change
   */
  async logStatusChange(
    campaignId: string,
    source: string,
    previousStatus: CampaignStatus | string | null,
    newStatus: CampaignStatus | string,
    message: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log(campaignId, {
      event: 'STATUS_CHANGE',
      source,
      previousStatus,
      newStatus,
      message,
      details,
    });
  }

  /**
   * Log an API call (Tonic, Meta, TikTok, Anthropic)
   */
  async logApiCall(
    campaignId: string,
    source: string,
    apiName: string,
    endpoint: string,
    success: boolean,
    durationMs: number,
    details?: Record<string, any>,
    errorMessage?: string
  ): Promise<void> {
    await this.log(campaignId, {
      event: 'API_CALL',
      source,
      message: `${apiName} ${endpoint} - ${success ? 'SUCCESS' : 'FAILED'}${errorMessage ? `: ${errorMessage}` : ''}`,
      details: {
        api: apiName,
        endpoint,
        success,
        ...details,
      },
      isError: !success,
      errorCode: !success ? details?.statusCode?.toString() : null,
      durationMs,
    });
  }

  /**
   * Log an error
   */
  async logError(
    campaignId: string,
    source: string,
    error: Error | any,
    context?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.log(campaignId, {
      event: 'ERROR',
      source,
      message: context ? `${context}: ${error.message}` : error.message,
      details: {
        ...details,
        errorType: error.constructor?.name,
        status: error.status,
        response: error.response?.data,
      },
      isError: true,
      errorCode: error.status?.toString() || error.code || 'UNKNOWN',
      errorStack: error.stack?.substring(0, 2000),
    });
  }

  /**
   * Log a process step (useful for tracking flow through the orchestrator)
   */
  async logStep(
    campaignId: string,
    source: string,
    step: string,
    message: string,
    details?: Record<string, any>,
    durationMs?: number
  ): Promise<void> {
    await this.log(campaignId, {
      event: 'PROCESS_STEP',
      source,
      message: `[${step}] ${message}`,
      details,
      durationMs,
    });
  }

  /**
   * Get audit logs for a campaign (most recent first)
   */
  async getLogs(campaignId: string, limit: number = 100) {
    return prisma.campaignAuditLog.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get error logs for a campaign
   */
  async getErrors(campaignId: string, limit: number = 50) {
    return prisma.campaignAuditLog.findMany({
      where: {
        campaignId,
        isError: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// Export singleton instance
export const campaignAudit = new CampaignAuditService();
