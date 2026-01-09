import axios, { AxiosInstance } from 'axios';
import { logger } from '@/lib/logger';

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

export interface TonicStatsByCountry {
  campaign_id: string;
  country_code: string;
  clicks: string;
  revenue: string;
  rpc: string;
}

/**
 * Tonic Pixel Parameters
 * Based on Tonic API documentation for /privileged/v3/campaign/pixel/{platform}
 *
 * NOTE: Despite the documentation being incomplete, pixel_id and access_token ARE REQUIRED by the API.
 * This was discovered through error responses:
 * - "Missing required parameter 'pixel_id'"
 * - "Missing required parameter 'access_token'"
 *
 * pixel_id: The Meta/TikTok pixel ID that already exists in those platforms
 * - Meta: 15-digit pixel ID from Meta Events Manager
 * - TikTok: Pixel ID from TikTok Ads Manager > Assets > Event > Website Pixel
 *
 * access_token: REQUIRED for Facebook Conversion API
 * - Meta: Account-specific access token from Meta Business settings
 * - TikTok: Account-specific access token from TikTok Ads Manager
 *
 * Facebook-specific params:
 * - event_name: Lead, AddPaymentInfo, AddToCart, etc.
 * - revenue_type: How to track revenue
 *
 * TikTok-specific params:
 * - revenue_type: How to track revenue
 */
export interface TonicPixelParams {
  campaign_id: number;
  pixel_id: string; // REQUIRED (despite incomplete documentation)
  access_token: string; // REQUIRED for Facebook Conversion API (despite incomplete documentation)
  // Facebook-specific (optional)
  event_name?: string; // 'Lead', 'AddPaymentInfo', 'AddToCart', etc.
  // Common (optional)
  revenue_type?: 'preestimated_revenue' | 'estimated_revenue' | 'estimated_revenue_5h';
}

class TonicService {
  private client: AxiosInstance;
  private tokenCache: Map<string, { token: string; expiry: number }> = new Map();

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.publisher.tonic.com',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Authenticate and get JWT token with credential-specific caching
   */
  async authenticate(credentials: TonicCredentials): Promise<string> {
    const cacheKey = credentials.consumer_key;

    // Check if token is still valid
    const cached = this.tokenCache.get(cacheKey);
    if (cached && Date.now() / 1000 < cached.expiry - 300) {
      return cached.token;
    }

    logger.info('tonic', `Authenticating with consumer_key: ${credentials.consumer_key.substring(0, 10)}...`);

    try {
      const response = await this.client.post<TonicAuthResponse>('/jwt/authenticate', {
        consumer_key: credentials.consumer_key,
        consumer_secret: credentials.consumer_secret,
      });

      this.tokenCache.set(cacheKey, {
        token: response.data.token,
        expiry: response.data.expires,
      });

      logger.success('tonic', `Authentication successful, token expires: ${new Date(response.data.expires * 1000).toLocaleString('es-ES')}`);

      return response.data.token;
    } catch (error: any) {
      logger.error('tonic', `Authentication failed: ${error.message}`, {
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  /**
   * Get authenticated axios instance with Bearer token
   */
  private async getAuthenticatedClient(credentials: TonicCredentials): Promise<AxiosInstance> {
    const token = await this.authenticate(credentials);

    return axios.create({
      baseURL: 'https://api.publisher.tonic.com',
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
  async getOffers(credentials: TonicCredentials, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/offers/list', {
      params: { type, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get offers for a specific country
   */
  async getOffersForCountry(credentials: TonicCredentials, country: string, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient(credentials);
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
  async createCampaign(credentials: TonicCredentials, params: TonicCampaignParams): Promise<string | number> {
    const client = await this.getAuthenticatedClient(credentials);

    // CRITICAL: Campaign type must be explicitly provided to avoid permission errors
    // Accounts may have permissions for only 'rsoc' or only 'display'
    if (!params.type) {
      logger.error('tonic', 'Campaign type not provided! This will cause the API to default to "display" which may fail for RSOC-only accounts.');
      throw new Error('Campaign type (display or rsoc) must be explicitly specified. Please ensure the orchestrator is setting the type parameter.');
    }

    // Auto-detect imprint based on EU countries
    let imprint = params.imprint;
    if (!imprint) {
      const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
      imprint = euCountries.includes(params.country) ? 'yes' : 'no';
    }

    // CRITICAL FIX: Tonic API expects parameters as QUERY PARAMETERS, not in the request body!
    // This is how your working Google Sheets code does it.

    // NOTE: The campaign name is used as-is. The orchestrator already handles uniqueness
    // if needed. We don't add suffixes here to preserve Looker tracking compatibility.

    const queryParams: Record<string, string | number> = {
      name: params.name,
      country: params.country,
      type: params.type,
      imprint: imprint,
      return_type: 'id',
    };

    // Add offer (name or ID)
    if (params.offer_id) {
      queryParams.offer_id = params.offer_id;
    }
    if (params.offer) {
      queryParams.offer = params.offer;
    }

    // Add headline_id for RSOC campaigns
    if (params.headline_id) {
      queryParams.headline_id = params.headline_id;
    }

    // DO NOT include domain parameter - your working code doesn't send it!
    // Tonic handles domain automatically for RSOC campaigns

    logger.info('tonic', `Creating ${params.type.toUpperCase()} campaign: "${params.name}"`, queryParams);

    try {
      // Build URL with query parameters (like your Google Sheets code)
      const urlParams = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

      const fullUrl = `/privileged/v3/campaign/create?${urlParams}`;

      logger.info('tonic', `Full URL: ${fullUrl}`);

      // POST with empty body (like your Google Sheets code)
      const response = await client.post(fullUrl);

      // DEBUG: Log the complete raw response from Tonic
      logger.info('tonic', '🔍 RAW TONIC RESPONSE:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        dataType: typeof response.data,
        dataIsArray: Array.isArray(response.data),
      });

      // Check if response is a valid campaign ID (should be a number)
      const campaignId = response.data;

      // Tonic API has a weird behavior: it returns HTTP 200 even on errors
      // The error message is in the response body as a string
      // Valid campaign IDs are numbers or numeric strings
      // Error messages are strings like "You're not allowed to create a campaign"

      if (typeof campaignId === 'string') {
        // Check if it's a numeric string (valid campaign ID)
        const numericId = Number(campaignId);
        if (isNaN(numericId)) {
          // This is an error message from Tonic (non-numeric string)
          logger.error('tonic', `❌ Tonic returned error message: ${campaignId}`, {
            request: queryParams,
            response: response.data,
            responseType: typeof response.data,
          });
          throw new Error(`Tonic API error: ${campaignId}`);
        }
        // It's a numeric string, that's OK - convert to number
        logger.success('tonic', `✅ Campaign created successfully with ID: ${numericId}`);
        return numericId;
      } else if (typeof campaignId === 'number') {
        // Already a number, perfect
        logger.success('tonic', `✅ Campaign created successfully with ID: ${campaignId}`);
        return campaignId;
      } else {
        // Unexpected response type
        logger.error('tonic', `❌ Unexpected response type from Tonic`, {
          request: queryParams,
          response: response.data,
          responseType: typeof response.data,
        });
        throw new Error(`Unexpected response from Tonic API: ${JSON.stringify(campaignId)}`);
      }
    } catch (error: any) {
      // DEBUG: Log COMPLETE error details
      logger.error('tonic', `❌ CAMPAIGN CREATION AXIOS ERROR - Full Details:`, {
        message: error.message,
        request: {
          method: 'POST',
          url: '/privileged/v3/campaign/create',
          params: queryParams,
        },
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
          dataType: typeof error.response.data,
        } : 'NO RESPONSE OBJECT',
        isAxiosError: error.isAxiosError,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Get campaign list
   */
  async getCampaignList(credentials: TonicCredentials, state: 'incomplete' | 'pending' | 'active' | 'stopped' | 'deleted' = 'active') {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/campaign/list', {
      params: { state, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get campaign status
   */
  async getCampaignStatus(credentials: TonicCredentials, campaignId: string) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/campaign/status', {
      params: { id: campaignId },
    });
    return response.data;
  }

  /**
   * Rename campaign
   */
  async renameCampaign(credentials: TonicCredentials, campaignId: number, newName: string) {
    const client = await this.getAuthenticatedClient(credentials);
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
  async setKeywords(credentials: TonicCredentials, params: TonicKeywordsParams) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.post('/privileged/v3/campaign/keywords', params);
    return response.data;
  }

  /**
   * Get keywords for a campaign
   */
  async getKeywords(credentials: TonicCredentials, campaignId: number) {
    const client = await this.getAuthenticatedClient(credentials);
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
  async createArticleRequest(credentials: TonicCredentials, params: TonicArticleRequest): Promise<number> {
    try {
      const client = await this.getAuthenticatedClient(credentials);

      logger.info('tonic', '📝 Creating RSOC article request...');
      logger.info('tonic', 'Article request params:', JSON.stringify(params, null, 2));

      const response = await client.post('/privileged/v3/rsoc/create', params);

      logger.success('tonic', `✅ Article request created successfully. Response:`, response.data);

      // Returns the article request ID (headline_id)
      return response.data;
    } catch (error: any) {
      logger.error('tonic', '❌ RSOC article creation failed');
      logger.error('tonic', 'Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        requestParams: params,
      });

      // Extract the clear error message from Tonic's 'data' field
      // Tonic returns errors in data array like: ['Content generation phrases have to be unique. [Root=...]']
      let tonicDataMessage = '';
      if (error.response?.data) {
        if (Array.isArray(error.response.data)) {
          tonicDataMessage = error.response.data.join('; ');
        } else if (typeof error.response.data === 'object') {
          tonicDataMessage = JSON.stringify(error.response.data);
        } else {
          tonicDataMessage = String(error.response.data);
        }
      }

      // Create a rich error with all details
      const errorMessage = `RSOC article creation failed: ${error.response?.data?.message || error.message}`;
      const enrichedError = new Error(errorMessage) as any;
      enrichedError.tonicData = tonicDataMessage;
      enrichedError.status = error.response?.status;
      enrichedError.statusText = error.response?.statusText;

      throw enrichedError;
    }
  }

  /**
   * Get available headlines/articles
   */
  async getHeadlines(credentials: TonicCredentials) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/rsoc/headlines');
    return response.data;
  }

  /**
   * Get article request details
   */
  async getArticleRequest(credentials: TonicCredentials, requestId: number) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/rsoc/request', {
      params: { request_id: requestId },
    });
    return response.data;
  }

  /**
   * Get all article requests
   */
  async getArticleRequests(credentials: TonicCredentials) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/rsoc/requests');
    return response.data;
  }

  /**
   * Get available domains and languages for RSOC
   */
  async getRSOCDomains(credentials: TonicCredentials) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/rsoc/domains');
    return response.data;
  }

  /**
   * Get RSOC stats by country for a specific date
   * Returns revenue, clicks, and RPC (Revenue Per Click) per campaign and country
   *
   * @param credentials - Tonic API credentials
   * @param date - Date in YYYY-MM-DD format
   * @param hour - Optional hour (0-23) for more granular data
   * @returns Array of stats with campaign_id, country_code, clicks, revenue, rpc
   *
   * Note: RPC values are only calculated starting from the 10th click.
   * Until 10 clicks are reached, the API returns 0 for rpc and clicks.
   */
  async getStatsByCountry(
    credentials: TonicCredentials,
    date: string,
    hour?: number
  ): Promise<TonicStatsByCountry[]> {
    const client = await this.getAuthenticatedClient(credentials);

    const params: Record<string, string | number> = { date };
    if (hour !== undefined && hour >= 0 && hour <= 23) {
      params.hour = hour;
    }

    logger.info('tonic', `Fetching RSOC stats by country for date: ${date}${hour !== undefined ? ` hour: ${hour}` : ''}`);

    try {
      const response = await client.get('/privileged/v3/rsoc/stats_by_country', { params });

      logger.success('tonic', `Stats by country fetched successfully`, {
        recordCount: Array.isArray(response.data) ? response.data.length : 0,
        date,
        hour,
      });

      return response.data;
    } catch (error: any) {
      logger.error('tonic', `Failed to fetch stats by country`, {
        date,
        hour,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get aggregated gross revenue for a specific campaign ID
   * Sums revenue across all countries for the given campaign
   *
   * @param credentials - Tonic API credentials
   * @param campaignId - Tonic campaign ID
   * @param date - Date in YYYY-MM-DD format
   * @returns Total gross revenue for the campaign
   */
  async getCampaignGrossRevenue(
    credentials: TonicCredentials,
    campaignId: string,
    date: string
  ): Promise<number> {
    const stats = await this.getStatsByCountry(credentials, date);

    // Filter by campaign_id and sum revenue
    const campaignStats = stats.filter(s => s.campaign_id === campaignId);

    const totalRevenue = campaignStats.reduce((sum, stat) => {
      return sum + parseFloat(stat.revenue || '0');
    }, 0);

    logger.info('tonic', `Campaign ${campaignId} gross revenue for ${date}: $${totalRevenue.toFixed(2)}`, {
      countriesFound: campaignStats.length,
      breakdown: campaignStats.map(s => ({
        country: s.country_code,
        revenue: s.revenue,
        clicks: s.clicks,
      })),
    });

    return totalRevenue;
  }

  // ============================================
  // PIXELS
  // ============================================

  /**
   * Create a pixel for tracking
   *
   * Sends only the parameters documented in Tonic API:
   * - Facebook: campaign_id, event_name (optional), revenue_type (optional), access_token (optional)
   * - TikTok: campaign_id, revenue_type (optional)
   */
  async createPixel(credentials: TonicCredentials, platform: 'facebook' | 'tiktok', params: TonicPixelParams) {
    const client = await this.getAuthenticatedClient(credentials);

    let endpoint = '';
    if (platform === 'facebook') {
      endpoint = '/privileged/v3/campaign/pixel/facebook';
    } else if (platform === 'tiktok') {
      endpoint = '/privileged/v3/campaign/pixel/tiktok';
    }

    logger.info('tonic', `Creating ${platform} pixel for campaign ${params.campaign_id}`, {
      endpoint,
      params,
    });

    try {
      const response = await client.post(endpoint, params);
      logger.success('tonic', `${platform} pixel created successfully`, {
        campaignId: params.campaign_id,
        response: response.data,
      });
      return response.data;
    } catch (error: any) {
      logger.error('tonic', `Failed to create ${platform} pixel`, {
        campaignId: params.campaign_id,
        endpoint,
        params,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorData: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get pixel data for a campaign
   */
  async getPixel(credentials: TonicCredentials, campaignId: number) {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/campaign/pixel', {
      params: { campaign_id: campaignId },
    });
    return response.data;
  }

  /**
   * Delete pixel from a campaign
   */
  async deletePixel(credentials: TonicCredentials, campaignId: number) {
    const client = await this.getAuthenticatedClient(credentials);
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
  async getCountries(credentials: TonicCredentials, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/countries/list', {
      params: { type, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get available countries for a specific offer
   */
  async getCountriesForOffer(credentials: TonicCredentials, offerId: number, type: 'display' | 'rsoc' = 'display') {
    const client = await this.getAuthenticatedClient(credentials);
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
    credentials: TonicCredentials,
    campaignId: number,
    type: 'redirect' | 'view' | 'viewrt' | 'click' | 'estimated_revenue' | 'estimated_revenue_5h' | 'preestimated_revenue',
    url: string
  ) {
    const client = await this.getAuthenticatedClient(credentials);
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
  async getCallbackUrls(credentials: TonicCredentials, campaignId: number) {
    const client = await this.getAuthenticatedClient(credentials);
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
  async getDailyEPC(credentials: TonicCredentials, date: string, campaignType?: 'display' | 'rsoc') {
    const client = await this.getAuthenticatedClient(credentials);
    const response = await client.get('/privileged/v3/epc/daily', {
      params: { date, type: campaignType, output: 'json' },
    });
    return response.data;
  }

  /**
   * Get final EPC data for a date range
   */
  async getFinalEPC(credentials: TonicCredentials, from: string, to: string, campaignId?: number) {
    const client = await this.getAuthenticatedClient(credentials);
    const params: Record<string, string | number> = { from, to, output: 'json' };
    if (campaignId !== undefined) {
      params.campaign_id = campaignId;
    }

    logger.info('tonic', `Calling EPC Final endpoint`, { from, to, campaignId, params });

    const response = await client.get('/privileged/v3/epc/final', { params });

    logger.info('tonic', `EPC Final response received`, {
      status: response.status,
      dataType: typeof response.data,
      isArray: Array.isArray(response.data),
      recordCount: Array.isArray(response.data) ? response.data.length : 'N/A'
    });

    return response.data;
  }

  /**
   * Get gross revenue by campaign for a date range using EPC Final endpoint
   * Returns a Map of campaignId -> totalRevenueUsd
   *
   * @param credentials - Tonic API credentials
   * @param from - Start date in YYYY-MM-DD format
   * @param to - End date in YYYY-MM-DD format
   * @returns Map with campaignId as key and total revenueUsd as value
   */
  async getCampaignGrossRevenueRange(
    credentials: TonicCredentials,
    from: string,
    to: string
  ): Promise<Map<string, number>> {
    logger.info('tonic', `Fetching gross revenue for date range: ${from} to ${to}`);

    try {
      const epcData = await this.getFinalEPC(credentials, from, to);

      // Log sample data to debug field names
      logger.info('tonic', `EPC Final raw response type: ${typeof epcData}, isArray: ${Array.isArray(epcData)}`);
      if (Array.isArray(epcData) && epcData.length > 0) {
        logger.info('tonic', `EPC Final sample record fields: ${Object.keys(epcData[0]).join(', ')}`);
        logger.info('tonic', `EPC Final sample record: ${JSON.stringify(epcData[0])}`);
      }

      // Build revenue map by campaignId
      const revenueMap = new Map<string, number>();

      if (Array.isArray(epcData)) {
        for (const record of epcData) {
          // EPC Final uses snake_case: campaign_id (string), revenueUsd (string decimal)
          const rawCampaignId = record.campaign_id;
          if (!rawCampaignId) {
            logger.warn('tonic', `Record missing campaign_id field`);
            continue;
          }

          // Always convert to string for consistent map lookup
          const campaignId = String(rawCampaignId);
          const revenue = parseFloat(record.revenueUsd || '0');
          const currentRevenue = revenueMap.get(campaignId) || 0;
          revenueMap.set(campaignId, currentRevenue + revenue);
        }
      } else {
        logger.error('tonic', `EPC Final did not return an array`, { type: typeof epcData, data: epcData });
      }

      logger.success('tonic', `Revenue map built for ${revenueMap.size} campaigns`, {
        dateRange: `${from} to ${to}`,
        totalRecords: Array.isArray(epcData) ? epcData.length : 0,
        campaignCount: revenueMap.size,
        totalRevenue: Array.from(revenueMap.values()).reduce((sum, v) => sum + v, 0).toFixed(2),
      });

      return revenueMap;
    } catch (error: any) {
      logger.error('tonic', `Failed to fetch gross revenue range`, {
        from,
        to,
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Get gross revenue for a specific campaign for a date range
   *
   * @param credentials - Tonic API credentials
   * @param campaignId - Tonic campaign ID
   * @param from - Start date in YYYY-MM-DD format
   * @param to - End date in YYYY-MM-DD format
   * @returns Total gross revenue for the campaign
   */
  async getCampaignGrossRevenueForRange(
    credentials: TonicCredentials,
    campaignId: string,
    from: string,
    to: string
  ): Promise<number> {
    const revenueMap = await this.getCampaignGrossRevenueRange(credentials, from, to);
    const revenue = revenueMap.get(campaignId) || 0;

    logger.info('tonic', `Campaign ${campaignId} gross revenue for ${from} to ${to}: $${revenue.toFixed(2)}`);

    return revenue;
  }

  // ============================================
  // COMPLIANCE (v4 API)
  // ============================================

  /**
   * Get all ad IDs with compliance status
   * Uses Tonic API v4: GET /compliance/adIds
   */
  async getComplianceAdIds(
    credentials: TonicCredentials,
    params?: {
      campaignIds?: string;      // Comma-separated campaign IDs
      campaignName?: string;     // Filter by campaign name
      adIds?: string;            // Comma-separated ad IDs
      networks?: string;         // 'facebook,tiktok,taboola'
      status?: 'allowed' | 'declined';
      withCampaignName?: boolean;
      hasReviewRequest?: boolean;
      orderField?: string;
      orderOrientation?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<TonicComplianceAdId[]> {
    const token = await this.authenticate(credentials);

    // v4 API uses different base URL
    const v4Client = axios.create({
      baseURL: 'https://api.publisher.tonic.com/v4',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('tonic', `Fetching compliance ad IDs`, params);

    try {
      const response = await v4Client.get('/compliance/adIds', { params });

      const adIds = response.data?.data || [];
      logger.success('tonic', `Compliance ad IDs fetched`, {
        count: adIds.length,
        filters: params,
      });

      return adIds;
    } catch (error: any) {
      logger.error('tonic', `Failed to fetch compliance ad IDs`, {
        status: error.response?.status,
        data: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get details for a specific ad ID
   * Uses Tonic API v4: GET /compliance/adIds/{id}
   */
  async getComplianceAdIdDetails(
    credentials: TonicCredentials,
    adId: string
  ): Promise<TonicComplianceAdId> {
    const token = await this.authenticate(credentials);

    const v4Client = axios.create({
      baseURL: 'https://api.publisher.tonic.com/v4',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('tonic', `Fetching compliance details for ad ID: ${adId}`);

    try {
      const response = await v4Client.get(`/compliance/adIds/${adId}`);

      logger.success('tonic', `Compliance details fetched for ad ID: ${adId}`);

      return response.data?.data || response.data;
    } catch (error: any) {
      logger.error('tonic', `Failed to fetch compliance details for ad ID: ${adId}`, {
        status: error.response?.status,
        data: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get ad ID compliance status change log
   * Uses Tonic API v4: GET /compliance/adIds/changeLog
   */
  async getComplianceChangeLog(
    credentials: TonicCredentials,
    params?: {
      adId?: string;
      campaignId?: number;
      campaignName?: string;
      from?: string;             // Date in YYYY-MM-DD format
      to?: string;               // Date in YYYY-MM-DD format
      orderField?: string;
      orderOrientation?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<TonicComplianceChangeLog[]> {
    const token = await this.authenticate(credentials);

    const v4Client = axios.create({
      baseURL: 'https://api.publisher.tonic.com/v4',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('tonic', `Fetching compliance change log`, params);

    try {
      const response = await v4Client.get('/compliance/adIds/changeLog', { params });

      const changeLogs = response.data?.data || [];
      logger.success('tonic', `Compliance change log fetched`, {
        count: changeLogs.length,
        filters: params,
      });

      return changeLogs;
    } catch (error: any) {
      logger.error('tonic', `Failed to fetch compliance change log`, {
        status: error.response?.status,
        data: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send a review request (appeal) for a disallowed ad ID
   * Uses Tonic API v4: POST /compliance/adIds/reviewRequest
   *
   * @param credentials - Tonic API credentials
   * @param campaignId - The campaign ID associated with the ad ID
   * @param adId - The ad ID for which to send the review request (max 50 chars)
   * @param message - Detailed message explaining why status should be reconsidered (10-500 chars)
   */
  async sendComplianceReviewRequest(
    credentials: TonicCredentials,
    campaignId: number,
    adId: string,
    message: string
  ): Promise<void> {
    // Validate message length
    if (message.length < 10 || message.length > 500) {
      throw new Error(`Review request message must be between 10 and 500 characters (got ${message.length})`);
    }

    // Validate adId length
    if (adId.length > 50) {
      throw new Error(`Ad ID must be max 50 characters (got ${adId.length})`);
    }

    const token = await this.authenticate(credentials);

    const v4Client = axios.create({
      baseURL: 'https://api.publisher.tonic.com/v4',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    logger.info('tonic', `Sending compliance review request`, {
      campaignId,
      adId,
      messageLength: message.length,
    });

    try {
      await v4Client.post('/compliance/adIds/reviewRequest', {
        campaignId,
        adId,
        message,
      });

      logger.success('tonic', `Compliance review request sent successfully`, {
        campaignId,
        adId,
      });
    } catch (error: any) {
      logger.error('tonic', `Failed to send compliance review request`, {
        campaignId,
        adId,
        status: error.response?.status,
        data: error.response?.data,
        error: error.message,
      });
      throw error;
    }
  }
}

// ============================================
// COMPLIANCE INTERFACES (v4 API)
// ============================================

export interface TonicComplianceAdId {
  adId: string;
  network: 'facebook' | 'tiktok' | 'taboola';
  status: 'allowed' | 'declined';
  adIdAlignment?: string;        // Rejection reason explanation
  campaignId: number;
  campaignName?: string;
  adLibraryLink?: string;
  lastCheck: string;
  reviewRequest?: TonicReviewRequest | null;
  content?: any;                 // Ad content (text, images, etc.)
  metadata?: any;                // Additional metadata (e.g., adgroup_id for TikTok)
  complianceStatusChangeDate?: string;
}

export interface TonicReviewRequest {
  status: 'pending' | 'accepted' | 'declined';
  message: string;
  date: string;
}

export interface TonicComplianceChangeLog {
  adId: string;
  campaignId: number;
  campaignName?: string;
  network: string;
  changeType: string;           // 'auto' or other
  prevStatus: string;
  newStatus: string;
  checkedAt: string;
  adLibraryLink?: string;
}

// Export singleton instance
export const tonicService = new TonicService();
export default tonicService;
