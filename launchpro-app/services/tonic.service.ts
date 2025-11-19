import axios, { AxiosInstance } from 'axios';
import { env } from '@/lib/env';

/**
 * Tonic API Service
 * Handles all interactions with the Tonic for Publishers API
 */

export interface TonicCredentials {
  consumer_key: string;
  consumer_secret: string;
}

export interface TonicAuthResponse {
  token: string;
  expires: number;
}

export interface TonicCampaignParams {
  name: string;
  offer?: string;
  offer_id?: string;
  country: string;
  domain?: string;
  imprint?: 'yes' | 'no';
  return_type?: 'id';
  type?: 'display' | 'rsoc';
  headline_id?: string;
}

export interface TonicKeywordsParams {
  campaign_id: number;
  keywords: string[];
  keyword_amount?: number; // 3-10, default 6
}

export interface TonicArticleRequest {
  offer_id: number;
  country: string;
  language: string;
  domain: string;
  content_generation_phrases: string[];
  headline?: string;
  teaser?: string;
  citation_links?: string[];
}

export interface TonicPixelParams {
  campaign_id: number;
  source: 'facebook' | 'tiktok' | 'google' | 'taboola' | 'outbrain' | 'yahoo';
  event_name?: string;
  send_revenue?: 'yes' | 'no';
  access_token?: string; // For Facebook
  pixel_id?: string;
  revenue_type?: 'preestimated_revenue' | 'estimated_revenue' | 'estimated_revenue_5h';
}

class TonicService {
  private client: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: number | null = null;

  // Token cache for multiple accounts
  private static tokenCache: Map<string, { token: string; expiry: number }> = new Map();

  // Account credentials (optional, for multi-account support)
  private credentials?: TonicCredentials;

  constructor(credentials?: TonicCredentials) {
    this.credentials = credentials;
    this.client = axios.create({
      baseURL: env.TONIC_API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a new TonicService instance with specific account credentials
   */
  static withCredentials(credentials: TonicCredentials): TonicService {
    return new TonicService(credentials);
  }

  /**
   * Authenticate and get JWT token
   * Uses account-specific credentials if provided, otherwise uses .env credentials
   */
  async authenticate(credentials?: TonicCredentials): Promise<string> {
    const creds = credentials || this.credentials || {
      consumer_key: env.TONIC_API_USERNAME,
      consumer_secret: env.TONIC_API_PASSWORD,
    };

    // Create cache key
    const cacheKey = `${creds.consumer_key}:${creds.consumer_secret}`;

    // Check cache first
    const cached = TonicService.tokenCache.get(cacheKey);
    if (cached && Date.now() / 1000 < cached.expiry - 300) {
      return cached.token;
    }

    // Authenticate
    const response = await this.client.post<TonicAuthResponse>('/jwt/authenticate', {
      consumer_key: creds.consumer_key,
      consumer_secret: creds.consumer_secret,
    });

    const token = response.data.token;
    const expiry = response.data.expires;

    // Cache token
    TonicService.tokenCache.set(cacheKey, { token, expiry });

    // Also set instance token for backward compatibility
    if (!credentials && !this.credentials) {
      this.token = token;
      this.tokenExpiry = expiry;
    }

    return token;
  }

  /**
   * Get authenticated axios instance with Bearer token
   */
  private async getAuthenticatedClient(credentials?: TonicCredentials): Promise<AxiosInstance> {
    const token = await this.authenticate(credentials);

    return axios.create({
      baseURL: env.TONIC_API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // ============================================
  // OFFERS
  // ============================================

  /**
   * Get list of available offers
   */
  async getOffers(type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/offers/list', {
      params: { type, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get offers for a specific country
   */
  async getOffersForCountry(country: string, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/offers/combination', {
      params: { country, type, output: 'json' },
    });
    return response.data;
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create a new campaign
   */
  async createCampaign(params: TonicCampaignParams): Promise<string | number> {
    const client = await this.getAuthenticatedClient();
    const response = await client.post('/privileged/v3/campaign/create', params);

    // If return_type is 'id', response will be the campaign ID
    return response.data;
  }

  /**
   * Get campaign list
   */
  async getCampaignList(state: 'incomplete' | 'pending' | 'active' | 'stopped' | 'deleted' = 'active') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/campaign/list', {
      params: { state, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get campaign status
   */
  async getCampaignStatus(campaignId: string) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/campaign/status', {
      params: { id: campaignId },
    });
    return response.data;
  }

  /**
   * Rename campaign
   */
  async renameCampaign(campaignId: number, newName: string) {
    const client = await this.getAuthenticatedClient();
    const response = await client.put('/privileged/v3/campaign/rename', {
      campaign_id: campaignId,
      campaign_name: newName,
    });
    return response.data;
  }

  // ============================================
  // KEYWORDS
  // ============================================

  /**
   * Set keywords for a campaign
   */
  async setKeywords(params: TonicKeywordsParams) {
    const client = await this.getAuthenticatedClient();
    const response = await client.post('/privileged/v3/campaign/keywords', params);
    return response.data;
  }

  /**
   * Get keywords for a campaign
   */
  async getKeywords(campaignId: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/campaign/keywords', {
      params: { campaign_id: campaignId },
    });
    return response.data;
  }

  // ============================================
  // RSOC (Articles)
  // ============================================

  /**
   * Create an article request for RSOC campaigns
   */
  async createArticleRequest(params: TonicArticleRequest): Promise<number> {
    const client = await this.getAuthenticatedClient();
    const response = await client.post('/privileged/v3/rsoc/create', params);
    // Returns the article request ID
    return response.data;
  }

  /**
   * Get available headlines/articles
   */
  async getHeadlines() {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/rsoc/headlines');
    return response.data;
  }

  /**
   * Get article request details
   */
  async getArticleRequest(requestId: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/rsoc/request', {
      params: { request_id: requestId },
    });
    return response.data;
  }

  /**
   * Get all article requests
   */
  async getArticleRequests() {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/rsoc/requests');
    return response.data;
  }

  /**
   * Get available domains and languages for RSOC
   */
  async getRSOCDomains() {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/rsoc/domains');
    return response.data;
  }

  // ============================================
  // PIXELS
  // ============================================

  /**
   * Create a pixel for tracking
   */
  async createPixel(platform: 'facebook' | 'tiktok', params: TonicPixelParams) {
    const client = await this.getAuthenticatedClient();

    let endpoint = '';
    if (platform === 'facebook') {
      endpoint = '/privileged/v3/campaign/pixel/facebook';
    } else if (platform === 'tiktok') {
      endpoint = '/privileged/v3/campaign/pixel/tiktok';
    }

    const response = await client.post(endpoint, params);
    return response.data;
  }

  /**
   * Get pixel data for a campaign
   */
  async getPixel(campaignId: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/campaign/pixel', {
      params: { campaign_id: campaignId },
    });
    return response.data;
  }

  /**
   * Delete pixel from a campaign
   */
  async deletePixel(campaignId: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.delete('/privileged/v3/campaign/pixel', {
      params: { campaign_id: campaignId },
    });
    return response.data;
  }

  // ============================================
  // COUNTRIES
  // ============================================

  /**
   * Get list of available countries
   */
  async getCountries(type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/countries/list', {
      params: { type, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get available countries for a specific offer
   */
  async getCountriesForOffer(offerId: number, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/countries/combination', {
      params: { offer_id: offerId, type, output: 'json' },
    });
    return response.data;
  }

  // ============================================
  // CALLBACKS
  // ============================================

  /**
   * Set callback URL for a campaign
   */
  async setCallbackUrl(
    campaignId: number,
    type: 'redirect' | 'view' | 'viewrt' | 'click' | 'estimated_revenue' | 'estimated_revenue_5h' | 'preestimated_revenue',
    url: string
  ) {
    const client = await this.getAuthenticatedClient();
    const response = await client.post('/privileged/v3/campaign/callback', {
      campaign_id: campaignId,
      type,
      url: encodeURIComponent(url),
    });
    return response.data;
  }

  /**
   * Get callback URLs for a campaign
   */
  async getCallbackUrls(campaignId: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/campaign/callback', {
      params: { campaign_id: campaignId },
    });
    return response.data;
  }

  // ============================================
  // REPORTING
  // ============================================

  /**
   * Get daily EPC tracking data
   */
  async getDailyEPC(date: string, campaignType?: 'display' | 'rsoc') {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/epc/daily', {
      params: { date, type: campaignType, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get final EPC data for a date range
   */
  async getFinalEPC(from: string, to: string, campaignId?: number) {
    const client = await this.getAuthenticatedClient();
    const response = await client.get('/privileged/v3/epc/final', {
      params: { from, to, campaign_id: campaignId, output: 'json' },
    });
    return response.data;
  }
}

// Export singleton instance
export const tonicService = new TonicService();
export default tonicService;
