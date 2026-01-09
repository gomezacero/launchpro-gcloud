import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  tonicService,
  TonicCredentials,
  TonicComplianceAdId,
  TonicComplianceChangeLog,
} from './tonic.service';

/**
 * Compliance Service
 * Aggregates compliance data from all Tonic accounts for the compliance dashboard
 */

// ============================================
// CONSTANTS
// ============================================

const SUPERADMIN_EMAIL = 'jesusmonterogrowth@gmail.com';

// ============================================
// INTERFACES
// ============================================

export interface ComplianceSummary {
  totalAds: number;
  allowedAds: number;
  declinedAds: number;
  pendingReviews: number;
  allowedPercentage: number;
  byNetwork: {
    facebook: { total: number; allowed: number; declined: number };
    tiktok: { total: number; allowed: number; declined: number };
    taboola: { total: number; allowed: number; declined: number };
  };
}

export interface ComplianceAdWithAccount extends TonicComplianceAdId {
  tonicAccountId: string;
  tonicAccountName: string;
}

export interface ComplianceChangeLogWithAccount extends TonicComplianceChangeLog {
  tonicAccountId: string;
  tonicAccountName: string;
}

export interface ComplianceFilters {
  networks?: string[];           // ['facebook', 'tiktok']
  status?: 'allowed' | 'declined' | 'all';
  campaignId?: number;
  campaignName?: string;
  hasReviewRequest?: boolean;
  limit?: number;
  offset?: number;
  userEmail?: string;           // Filter by manager (superadmin sees all)
}

// ============================================
// SERVICE CLASS
// ============================================

class ComplianceService {
  /**
   * Check if user is superadmin
   */
  private isSuperAdmin(userEmail?: string): boolean {
    return userEmail?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();
  }

  /**
   * Get allowed Tonic campaign IDs for a user
   * Returns null if user is superadmin (no filtering needed)
   */
  private async getAllowedTonicCampaignIds(userEmail?: string): Promise<Set<number> | null> {
    // Superadmin sees all
    if (!userEmail || this.isSuperAdmin(userEmail)) {
      return null;
    }

    // Get manager by email
    const manager = await prisma.manager.findFirst({
      where: { email: userEmail.toLowerCase() },
      select: { id: true },
    });

    if (!manager) {
      logger.warn('compliance', `Manager not found for email: ${userEmail}`);
      return new Set(); // Return empty set - no campaigns allowed
    }

    // Get campaigns created by this manager that have a tonicCampaignId
    const campaigns = await prisma.campaign.findMany({
      where: {
        createdById: manager.id,
        tonicCampaignId: { not: null },
      },
      select: {
        tonicCampaignId: true,
      },
    });

    const allowedIds = new Set<number>();
    for (const campaign of campaigns) {
      if (campaign.tonicCampaignId) {
        const id = parseInt(campaign.tonicCampaignId, 10);
        if (!isNaN(id)) {
          allowedIds.add(id);
        }
      }
    }

    logger.info('compliance', `User ${userEmail} has access to ${allowedIds.size} campaigns`);
    return allowedIds;
  }

  /**
   * Get all active Tonic accounts
   * Note: Accounts are company-level resources, not per-manager
   */
  private async getTonicAccounts(): Promise<Array<{
    id: string;
    name: string;
    credentials: TonicCredentials;
  }>> {
    const accounts = await prisma.account.findMany({
      where: {
        accountType: 'TONIC',
        tonicConsumerKey: { not: null },
        tonicConsumerSecret: { not: null },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        tonicConsumerKey: true,
        tonicConsumerSecret: true,
      },
    });

    return accounts
      .filter(a => a.tonicConsumerKey && a.tonicConsumerSecret)
      .map(a => ({
        id: a.id,
        name: a.name,
        credentials: {
          consumer_key: a.tonicConsumerKey!,
          consumer_secret: a.tonicConsumerSecret!,
        },
      }));
  }

  /**
   * Get compliance summary across all accounts
   */
  async getComplianceSummary(userEmail?: string): Promise<ComplianceSummary> {
    const accounts = await this.getTonicAccounts();
    const allowedCampaignIds = await this.getAllowedTonicCampaignIds(userEmail);

    if (accounts.length === 0) {
      return {
        totalAds: 0,
        allowedAds: 0,
        declinedAds: 0,
        pendingReviews: 0,
        allowedPercentage: 0,
        byNetwork: {
          facebook: { total: 0, allowed: 0, declined: 0 },
          tiktok: { total: 0, allowed: 0, declined: 0 },
          taboola: { total: 0, allowed: 0, declined: 0 },
        },
      };
    }

    const summary: ComplianceSummary = {
      totalAds: 0,
      allowedAds: 0,
      declinedAds: 0,
      pendingReviews: 0,
      allowedPercentage: 0,
      byNetwork: {
        facebook: { total: 0, allowed: 0, declined: 0 },
        tiktok: { total: 0, allowed: 0, declined: 0 },
        taboola: { total: 0, allowed: 0, declined: 0 },
      },
    };

    // Fetch compliance data from all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        try {
          const adIds = await tonicService.getComplianceAdIds(account.credentials, {
            withCampaignName: true,
            limit: 1000, // Get all for summary
          });
          return { accountId: account.id, adIds };
        } catch (error: any) {
          logger.warn('compliance', `Failed to fetch compliance for account ${account.name}`, {
            error: error.message,
          });
          return { accountId: account.id, adIds: [] };
        }
      })
    );

    // Aggregate results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const ad of result.value.adIds) {
          // Filter by allowed campaign IDs if not superadmin
          if (allowedCampaignIds !== null && !allowedCampaignIds.has(ad.campaignId)) {
            continue;
          }

          summary.totalAds++;

          if (ad.status === 'allowed') {
            summary.allowedAds++;
          } else {
            summary.declinedAds++;
          }

          if (ad.reviewRequest?.status === 'pending') {
            summary.pendingReviews++;
          }

          // Network breakdown
          const network = ad.network as 'facebook' | 'tiktok' | 'taboola';
          if (summary.byNetwork[network]) {
            summary.byNetwork[network].total++;
            if (ad.status === 'allowed') {
              summary.byNetwork[network].allowed++;
            } else {
              summary.byNetwork[network].declined++;
            }
          }
        }
      }
    }

    // Calculate percentage
    summary.allowedPercentage = summary.totalAds > 0
      ? Math.round((summary.allowedAds / summary.totalAds) * 100)
      : 0;

    return summary;
  }

  /**
   * Get compliance ads with filters
   */
  async getComplianceAds(
    filters: ComplianceFilters
  ): Promise<{
    ads: ComplianceAdWithAccount[];
    total: number;
    hasMore: boolean;
  }> {
    const accounts = await this.getTonicAccounts();
    const allowedCampaignIds = await this.getAllowedTonicCampaignIds(filters.userEmail);

    if (accounts.length === 0) {
      return { ads: [], total: 0, hasMore: false };
    }

    // If non-superadmin has no campaigns, return empty
    if (allowedCampaignIds !== null && allowedCampaignIds.size === 0) {
      return { ads: [], total: 0, hasMore: false };
    }

    const allAds: ComplianceAdWithAccount[] = [];

    // Build Tonic API params
    const tonicParams: Record<string, any> = {
      withCampaignName: true,
      limit: 1000, // Fetch all, we'll filter/paginate ourselves
    };

    if (filters.networks && filters.networks.length > 0) {
      tonicParams.networks = filters.networks.join(',');
    }

    if (filters.status && filters.status !== 'all') {
      tonicParams.status = filters.status;
    }

    if (filters.campaignId) {
      tonicParams.campaignIds = String(filters.campaignId);
    }

    if (filters.campaignName) {
      tonicParams.campaignName = filters.campaignName;
    }

    if (filters.hasReviewRequest !== undefined) {
      tonicParams.hasReviewRequest = filters.hasReviewRequest;
    }

    // Fetch from all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        try {
          const adIds = await tonicService.getComplianceAdIds(account.credentials, tonicParams);
          return {
            accountId: account.id,
            accountName: account.name,
            adIds,
          };
        } catch (error: any) {
          logger.warn('compliance', `Failed to fetch compliance for account ${account.name}`, {
            error: error.message,
          });
          return { accountId: account.id, accountName: account.name, adIds: [] };
        }
      })
    );

    // Combine results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const ad of result.value.adIds) {
          // Filter by allowed campaign IDs if not superadmin
          if (allowedCampaignIds !== null && !allowedCampaignIds.has(ad.campaignId)) {
            continue;
          }

          allAds.push({
            ...ad,
            tonicAccountId: result.value.accountId,
            tonicAccountName: result.value.accountName,
          });
        }
      }
    }

    // Sort by lastCheck descending (most recent first)
    allAds.sort((a, b) => {
      const dateA = new Date(a.lastCheck).getTime();
      const dateB = new Date(b.lastCheck).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    const paginatedAds = allAds.slice(offset, offset + limit);

    return {
      ads: paginatedAds,
      total: allAds.length,
      hasMore: offset + limit < allAds.length,
    };
  }

  /**
   * Get ad details by ad ID
   */
  async getAdDetails(
    adId: string,
    userEmail?: string
  ): Promise<ComplianceAdWithAccount | null> {
    const accounts = await this.getTonicAccounts();
    const allowedCampaignIds = await this.getAllowedTonicCampaignIds(userEmail);

    // Try each account until we find the ad
    for (const account of accounts) {
      try {
        const ad = await tonicService.getComplianceAdIdDetails(account.credentials, adId);
        if (ad) {
          // Check if user has access to this campaign
          if (allowedCampaignIds !== null && !allowedCampaignIds.has(ad.campaignId)) {
            return null; // User doesn't have access
          }

          return {
            ...ad,
            tonicAccountId: account.id,
            tonicAccountName: account.name,
          };
        }
      } catch (error: any) {
        // Ad not found in this account, try next
        if (error.response?.status !== 404) {
          logger.warn('compliance', `Error fetching ad ${adId} from account ${account.name}`, {
            error: error.message,
          });
        }
      }
    }

    return null;
  }

  /**
   * Get compliance change log
   */
  async getChangeLog(
    params: {
      adId?: string;
      campaignId?: number;
      campaignName?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
      userEmail?: string;
    }
  ): Promise<{
    logs: ComplianceChangeLogWithAccount[];
    total: number;
    hasMore: boolean;
  }> {
    const accounts = await this.getTonicAccounts();
    const allowedCampaignIds = await this.getAllowedTonicCampaignIds(params.userEmail);

    if (accounts.length === 0) {
      return { logs: [], total: 0, hasMore: false };
    }

    // If non-superadmin has no campaigns, return empty
    if (allowedCampaignIds !== null && allowedCampaignIds.size === 0) {
      return { logs: [], total: 0, hasMore: false };
    }

    const allLogs: ComplianceChangeLogWithAccount[] = [];

    // Fetch from all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        try {
          const logs = await tonicService.getComplianceChangeLog(account.credentials, {
            adId: params.adId,
            campaignId: params.campaignId,
            campaignName: params.campaignName,
            from: params.from,
            to: params.to,
            limit: 500,
          });
          return {
            accountId: account.id,
            accountName: account.name,
            logs,
          };
        } catch (error: any) {
          logger.warn('compliance', `Failed to fetch change log for account ${account.name}`, {
            error: error.message,
          });
          return { accountId: account.id, accountName: account.name, logs: [] };
        }
      })
    );

    // Combine results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const log of result.value.logs) {
          // Filter by allowed campaign IDs if not superadmin
          if (allowedCampaignIds !== null && !allowedCampaignIds.has(log.campaignId)) {
            continue;
          }

          allLogs.push({
            ...log,
            tonicAccountId: result.value.accountId,
            tonicAccountName: result.value.accountName,
          });
        }
      }
    }

    // Sort by checkedAt descending
    allLogs.sort((a, b) => {
      const dateA = new Date(a.checkedAt).getTime();
      const dateB = new Date(b.checkedAt).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const offset = params.offset || 0;
    const limit = params.limit || 50;
    const paginatedLogs = allLogs.slice(offset, offset + limit);

    return {
      logs: paginatedLogs,
      total: allLogs.length,
      hasMore: offset + limit < allLogs.length,
    };
  }

  /**
   * Send appeal request for a declined ad
   */
  async sendAppeal(
    adId: string,
    campaignId: number,
    message: string,
    userEmail?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate message length
    if (message.length < 10) {
      return { success: false, error: 'Message must be at least 10 characters' };
    }
    if (message.length > 500) {
      return { success: false, error: 'Message must be at most 500 characters' };
    }

    // Check if user has access to this campaign
    const allowedCampaignIds = await this.getAllowedTonicCampaignIds(userEmail);
    if (allowedCampaignIds !== null && !allowedCampaignIds.has(campaignId)) {
      return { success: false, error: 'You do not have access to this campaign' };
    }

    const accounts = await this.getTonicAccounts();

    // Find which account owns this ad
    for (const account of accounts) {
      try {
        // Try to send appeal through this account
        await tonicService.sendComplianceReviewRequest(
          account.credentials,
          campaignId,
          adId,
          message
        );

        logger.success('compliance', `Appeal sent for ad ${adId}`, {
          campaignId,
          account: account.name,
        });

        return { success: true };
      } catch (error: any) {
        // If we get a 404, the ad doesn't belong to this account - try next
        if (error.response?.status === 404) {
          continue;
        }

        // For other errors, log and return
        logger.error('compliance', `Failed to send appeal for ad ${adId}`, {
          error: error.message,
          account: account.name,
        });

        return {
          success: false,
          error: error.response?.data?.message || error.message,
        };
      }
    }

    return { success: false, error: 'Ad not found in any connected account' };
  }
}

// Export singleton instance
export const complianceService = new ComplianceService();
export default complianceService;
