import axios, { AxiosInstance } from 'axios';
import { env } from '@/lib/env';

/**
 * Taboola Backstage API Service
 * Handles campaign creation, item (ad) management, and account operations
 *
 * Taboola Hierarchy: Campaign → Item (Ad)
 *
 * API Documentation: https://developers.taboola.com/backstage-api/reference/welcome
 */

// ============================================
// INTERFACES
// ============================================

export interface TaboolaCampaignParams {
  name: string;
  branding_text: string;
  marketing_objective: 'LEADS_GENERATION' | 'DRIVE_WEBSITE_TRAFFIC';

  // Bidding
  bid_strategy: 'FIXED' | 'MAX_CONVERSIONS' | 'TARGET_CPA' | 'ENHANCED_CPC';
  cpc?: number; // Required when bid_strategy is 'FIXED'
  target_cpa?: number; // Required when bid_strategy is 'TARGET_CPA'

  // Budget
  spending_limit: number;
  spending_limit_model: 'MONTHLY' | 'NONE'; // NONE requires daily_cap
  daily_cap?: number; // Required when spending_limit_model is 'NONE'

  // Schedule
  start_date?: string; // ISO 8601 format, defaults to "now" if omitted
  end_date?: string; // ISO 8601 format

  // Targeting (optional)
  country_targeting?: {
    type: 'INCLUDE' | 'EXCLUDE';
    value: string[]; // Country codes like ['US', 'CA']
  };

  // Status
  is_active?: boolean; // Defaults to true
}

export interface TaboolaItemParams {
  url: string; // The landing page URL - REQUIRED for creation

  // These can be set after crawling completes
  title?: string;
  description?: string;
  thumbnail_url?: string;
  cta?: {
    cta_type: 'NONE' | 'LEARN_MORE' | 'SHOP_NOW' | 'SIGN_UP' | 'DOWNLOAD' | 'GET_QUOTE' | 'BOOK_NOW' | 'CONTACT_US';
  };
}

export interface TaboolaAccount {
  id: string;
  name: string;
  account_id: string; // The unique account identifier
  partner_types: string[]; // e.g., ['ADVERTISER']
  type?: string;
}

export interface TaboolaCampaign {
  id: string;
  advertiser_id: string;
  name: string;
  branding_text: string;
  cpc?: number;
  spending_limit: number;
  spending_limit_model: string;
  daily_cap?: number;
  marketing_objective: string;
  bid_strategy: string;
  status: string;
  approval_state: string;
  is_active: boolean;
  start_date?: string;
  end_date?: string;
}

export interface TaboolaItem {
  id: string;
  campaign_id: string;
  url: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  status: 'CRAWLING' | 'RUNNING' | 'NEED_TO_EDIT' | 'PAUSED' | 'STOPPED' | 'PENDING_APPROVAL';
  approval_state?: string;
  is_active?: boolean;
}

export interface TaboolaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

// ============================================
// SERVICE CLASS
// ============================================

class TaboolaService {
  private client: AxiosInstance;
  private accountId: string;
  private accessToken: string;
  private tokenExpiry: Date | null = null;

  private static readonly BASE_URL = 'https://backstage.taboola.com/backstage';
  private static readonly TOKEN_ENDPOINT = '/oauth/token';
  private static readonly API_VERSION = '1.0';

  constructor() {
    this.accountId = env.TABOOLA_ACCOUNT_ID || '';
    this.accessToken = '';

    this.client = axios.create({
      baseURL: TaboolaService.BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Get an access token using client credentials
   * Token expires after 12 hours
   */
  async getAccessToken(clientId?: string, clientSecret?: string): Promise<string> {
    const id = clientId || env.TABOOLA_CLIENT_ID;
    const secret = clientSecret || env.TABOOLA_CLIENT_SECRET;

    if (!id || !secret) {
      throw new Error('Taboola client credentials not configured');
    }

    const response = await axios.post(
      `${TaboolaService.BASE_URL}${TaboolaService.TOKEN_ENDPOINT}`,
      new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: 'client_credentials',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = response.data as TaboolaTokenResponse;
    this.accessToken = data.access_token;

    // Token expires in 12 hours, set expiry to 11 hours to be safe
    this.tokenExpiry = new Date(Date.now() + 11 * 60 * 60 * 1000);

    return this.accessToken;
  }

  /**
   * Refresh token if expired or about to expire
   */
  async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokenExpiry || new Date() >= this.tokenExpiry) {
      await this.getAccessToken();
    }
  }

  /**
   * Get an authenticated client with the current access token
   */
  private async getAuthenticatedClient(accessToken?: string): Promise<AxiosInstance> {
    const token = accessToken || this.accessToken;

    if (!token) {
      await this.getAccessToken();
    }

    return axios.create({
      baseURL: `${TaboolaService.BASE_URL}/api/${TaboolaService.API_VERSION}`,
      headers: {
        'Authorization': `Bearer ${accessToken || this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a service instance with specific account credentials
   */
  static withAccount(accountId: string, accessToken: string): TaboolaService {
    const service = new TaboolaService();
    service.accountId = accountId;
    service.accessToken = accessToken;
    return service;
  }

  // ============================================
  // ACCOUNT MANAGEMENT
  // ============================================

  /**
   * Get current account details
   * GET /users/current/account
   */
  async getAccountDetails(accessToken?: string): Promise<TaboolaAccount> {
    const client = await this.getAuthenticatedClient(accessToken);
    const response = await client.get('/users/current/account');
    return response.data;
  }

  /**
   * Get all allowed accounts for the current credentials
   * GET /users/current/allowed-accounts
   */
  async getAllowedAccounts(accessToken?: string): Promise<TaboolaAccount[]> {
    const client = await this.getAuthenticatedClient(accessToken);
    const response = await client.get('/users/current/allowed-accounts');
    return response.data.results || [];
  }

  /**
   * Get advertiser accounts in a network
   * GET /{network-account}/advertisers
   */
  async getAdvertiserAccounts(networkAccountId: string, accessToken?: string): Promise<TaboolaAccount[]> {
    const client = await this.getAuthenticatedClient(accessToken);
    const response = await client.get(`/${networkAccountId}/advertisers`);
    return response.data.results || [];
  }

  // ============================================
  // CAMPAIGN MANAGEMENT
  // ============================================

  /**
   * Create a new campaign
   * POST /{account_id}/campaigns/
   */
  async createCampaign(params: TaboolaCampaignParams, accountId?: string, accessToken?: string): Promise<TaboolaCampaign> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    if (!account) {
      throw new Error('Taboola account ID not configured');
    }

    const response = await client.post(`/${account}/campaigns/`, params);
    return response.data;
  }

  /**
   * Get a campaign by ID
   * GET /{account_id}/campaigns/{campaign_id}
   */
  async getCampaign(campaignId: string, accountId?: string, accessToken?: string): Promise<TaboolaCampaign> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.get(`/${account}/campaigns/${campaignId}/`);
    return response.data;
  }

  /**
   * Get all campaigns for an account
   * GET /{account_id}/campaigns/
   */
  async getCampaigns(accountId?: string, accessToken?: string): Promise<TaboolaCampaign[]> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.get(`/${account}/campaigns/`);
    return response.data.results || [];
  }

  /**
   * Update a campaign
   * PUT /{account_id}/campaigns/{campaign_id}
   */
  async updateCampaign(
    campaignId: string,
    params: Partial<TaboolaCampaignParams>,
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaCampaign> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.put(`/${account}/campaigns/${campaignId}/`, params);
    return response.data;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string, accountId?: string, accessToken?: string): Promise<TaboolaCampaign> {
    return this.updateCampaign(campaignId, { is_active: false }, accountId, accessToken);
  }

  /**
   * Resume a campaign
   */
  async resumeCampaign(campaignId: string, accountId?: string, accessToken?: string): Promise<TaboolaCampaign> {
    return this.updateCampaign(campaignId, { is_active: true }, accountId, accessToken);
  }

  /**
   * Delete a campaign
   * DELETE /{account_id}/campaigns/{campaign_id}
   */
  async deleteCampaign(campaignId: string, accountId?: string, accessToken?: string): Promise<void> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    await client.delete(`/${account}/campaigns/${campaignId}/`);
  }

  // ============================================
  // ITEM (AD) MANAGEMENT
  // ============================================

  /**
   * Create a campaign item (ad)
   * Only the URL is required initially. After crawling completes, you can update other fields.
   * POST /{account_id}/campaigns/{campaign_id}/items/
   */
  async createItem(
    campaignId: string,
    url: string,
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaItem> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.post(`/${account}/campaigns/${campaignId}/items/`, { url });
    return response.data;
  }

  /**
   * Get an item by ID
   * GET /{account_id}/campaigns/{campaign_id}/items/{item_id}
   */
  async getItem(
    campaignId: string,
    itemId: string,
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaItem> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.get(`/${account}/campaigns/${campaignId}/items/${itemId}/`);
    return response.data;
  }

  /**
   * Get all items for a campaign
   * GET /{account_id}/campaigns/{campaign_id}/items/
   */
  async getItems(campaignId: string, accountId?: string, accessToken?: string): Promise<TaboolaItem[]> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.get(`/${account}/campaigns/${campaignId}/items/`);
    return response.data.results || [];
  }

  /**
   * Update an item (only after status is not CRAWLING)
   * PUT /{account_id}/campaigns/{campaign_id}/items/{item_id}
   */
  async updateItem(
    campaignId: string,
    itemId: string,
    params: Partial<TaboolaItemParams>,
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaItem> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const response = await client.put(`/${account}/campaigns/${campaignId}/items/${itemId}/`, params);
    return response.data;
  }

  /**
   * Get item status (useful for polling after creation)
   */
  async getItemStatus(
    campaignId: string,
    itemId: string,
    accountId?: string,
    accessToken?: string
  ): Promise<string> {
    const item = await this.getItem(campaignId, itemId, accountId, accessToken);
    return item.status;
  }

  /**
   * Wait for item to finish crawling
   * Polls until status is no longer CRAWLING
   */
  async waitForItemReady(
    campaignId: string,
    itemId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 5000,
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaItem> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const item = await this.getItem(campaignId, itemId, accountId, accessToken);

      if (item.status !== 'CRAWLING') {
        return item;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Item ${itemId} still in CRAWLING state after ${maxWaitMs}ms`);
  }

  /**
   * Delete an item
   * DELETE /{account_id}/campaigns/{campaign_id}/items/{item_id}
   */
  async deleteItem(
    campaignId: string,
    itemId: string,
    accountId?: string,
    accessToken?: string
  ): Promise<void> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    await client.delete(`/${account}/campaigns/${campaignId}/items/${itemId}/`);
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Create multiple items in a campaign
   * POST /{account_id}/campaigns/{campaign_id}/items/mass
   */
  async createItemsBatch(
    campaignId: string,
    urls: string[],
    accountId?: string,
    accessToken?: string
  ): Promise<TaboolaItem[]> {
    const client = await this.getAuthenticatedClient(accessToken);
    const account = accountId || this.accountId;

    const items = urls.map(url => ({ url }));
    const response = await client.post(`/${account}/campaigns/${campaignId}/items/mass`, { items });
    return response.data.results || [];
  }
}

// Export singleton instance
export const taboolaService = new TaboolaService();

// Export class for creating new instances
export { TaboolaService };
