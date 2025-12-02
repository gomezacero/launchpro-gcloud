import axios, { AxiosInstance } from 'axios';
import { env } from '@/lib/env';
import FormData from 'form-data';

/**
 * Meta (Facebook/Instagram) Ads API Service
 * Handles campaign creation, ad set configuration, and ad creative management
 *
 * Meta Hierarchy: Campaign → Ad Set → Ad → Ad Creative
 */

export interface MetaCampaignParams {
  name: string;
  objective:
  | 'OUTCOME_AWARENESS'
  | 'OUTCOME_ENGAGEMENT'
  | 'OUTCOME_LEADS'
  | 'OUTCOME_SALES'
  | 'OUTCOME_TRAFFIC';
  status?: 'ACTIVE' | 'PAUSED';
  special_ad_categories?: string[]; // e.g., ['NONE'] or ['HOUSING', 'EMPLOYMENT', 'CREDIT']
  special_ad_category_country?: string[]; // Required when special_ad_categories is not NONE, e.g., ['US']
  daily_budget?: number; // in cents (for CBO - Campaign Budget Optimization)
  lifetime_budget?: number; // in cents (for CBO)
  bid_strategy?: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP';
}

export interface MetaAdSetParams {
  campaign_id: string;
  name: string;
  optimization_goal: string; // e.g., 'IMPRESSIONS', 'LINK_CLICKS', 'CONVERSIONS'
  billing_event: string; // e.g., 'IMPRESSIONS', 'LINK_CLICKS'
  bid_strategy?: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP'; // Bidding strategy
  bid_amount?: number; // in cents - Only used with COST_CAP or LOWEST_COST_WITH_BID_CAP
  daily_budget?: number; // in cents (if not CBO)
  lifetime_budget?: number; // in cents
  start_time?: string; // ISO 8601 format
  end_time?: string; // ISO 8601 format
  targeting?: MetaTargeting;
  status?: 'ACTIVE' | 'PAUSED';
  promoted_object?: {
    pixel_id: string;
    custom_event_type: string; // e.g., 'LEAD'
  };
}

export interface MetaTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[]; // 1 = male, 2 = female
  geo_locations?: {
    countries?: string[]; // e.g., ['US', 'CA']
    regions?: Array<{ key: string }>;
    cities?: Array<{ key: string; radius: number; distance_unit: 'mile' | 'kilometer' }>;
  };
  interests?: Array<{ id: string; name?: string }>;
  behaviors?: Array<{ id: string; name?: string }>;
  flexible_spec?: any[]; // Advanced targeting
  device_platforms?: ('mobile' | 'desktop')[];
  publisher_platforms?: ('facebook' | 'instagram' | 'audience_network' | 'messenger')[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  locales?: number[]; // e.g., [6] for Spanish
}

export interface MetaAdCreativeParams {
  name: string;
  object_story_spec?: {
    page_id: string;
    instagram_user_id?: string; // ID of the Instagram user (Meta API requires this instead of instagram_actor_id)
    link_data?: {
      link: string;
      message?: string;
      name?: string; // Headline
      description?: string;
      call_to_action?: {
        type: string; // 'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', etc.
        value?: {
          link?: string;
        };
      };
      image_hash?: string;
      picture?: string;
    };
    video_data?: {
      video_id: string;
      image_hash?: string;  // Thumbnail image hash (required for video ads)
      message?: string;
      title?: string;
      call_to_action?: {
        type: string;
        value?: {
          link?: string;
        };
      };
    };
  };
  degrees_of_freedom_spec?: {
    creative_features_spec?: {
      standard_enhancements?: {
        enroll_status?: 'OPT_IN' | 'OPT_OUT';
      };
    };
  };
}

export interface MetaAdParams {
  name: string;
  adset_id: string;
  creative: {
    creative_id: string;
  };
  status?: 'ACTIVE' | 'PAUSED';
  tracking_specs?: any[];
}

class MetaService {
  private client: AxiosInstance;
  private readonly adAccountId: string;

  constructor() {
    this.adAccountId = env.META_AD_ACCOUNT_ID || '';

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${env.META_API_VERSION}`,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        access_token: env.META_ACCESS_TOKEN,
      },
    });
  }

  /**
   * Get an authenticated Axios client
   * Uses the provided access token or falls back to the default one
   */
  private getClient(accessToken?: string): AxiosInstance {
    if (!accessToken) {
      return this.client;
    }

    return axios.create({
      baseURL: `https://graph.facebook.com/${env.META_API_VERSION}`,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        access_token: accessToken,
      },
    });
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create a new campaign
   *
   * CBO (Campaign Budget Optimization): Include daily_budget or lifetime_budget at campaign level
   * ABO (Ad Set Budget Optimization): Omit budget here, set at AdSet level
   */
  async createCampaign(params: MetaCampaignParams, adAccountId?: string, accessToken?: string) {
    const accountId = adAccountId || this.adAccountId;
    const payload: any = {
      name: params.name,
      objective: params.objective,
      status: params.status || 'PAUSED',
      special_ad_categories: params.special_ad_categories || [],
      // Required when special_ad_categories is not NONE/empty
      ...(params.special_ad_category_country && params.special_ad_category_country.length > 0 && {
        special_ad_category_country: params.special_ad_category_country,
      }),
      // Only include bid_strategy if defined (ABO mode doesn't use it at campaign level)
      ...(params.bid_strategy && { bid_strategy: params.bid_strategy }),
    };

    // Add budget if CBO (Campaign Budget Optimization)
    if (params.daily_budget) {
      payload.daily_budget = params.daily_budget;
    }
    if (params.lifetime_budget) {
      payload.lifetime_budget = params.lifetime_budget;
    }

    const isCBO = params.daily_budget || params.lifetime_budget;
    console.log('[META] Creating Campaign:', {
      accountId,
      name: payload.name,
      objective: payload.objective,
      mode: isCBO ? 'CBO (Campaign Budget Optimization)' : 'ABO (Ad Set Budget Optimization)',
      daily_budget: params.daily_budget || 'Not set (ABO mode)',
      lifetime_budget: params.lifetime_budget || 'Not set',
    });

    try {
      const client = this.getClient(accessToken);
      const response = await client.post(`/${accountId}/campaigns`, payload);
      console.log('[META] ✅ Campaign created successfully:', {
        id: response.data.id,
        name: payload.name,
      });
      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error || {};
      // Log the COMPLETE error response for debugging
      console.error('[META] ❌ Campaign creation failed - FULL ERROR:', JSON.stringify(error.response?.data, null, 2));
      console.error('[META] ❌ Campaign creation failed:', {
        accountId,
        message: metaError.message || error.message,
        error_user_msg: metaError.error_user_msg, // This often has the actual problem
        error_user_title: metaError.error_user_title,
        type: metaError.type,
        code: metaError.code,
        error_subcode: metaError.error_subcode,
        fbtrace_id: metaError.fbtrace_id,
        is_transient: metaError.is_transient,
        error_data: metaError.error_data, // Additional error details
        payload,
      });
      throw error;
    }
  }

  /**
   * Get campaign details
   */
  async getCampaign(campaignId: string) {
    const response = await this.client.get(`/${campaignId}`, {
      params: {
        fields: 'id,name,objective,status,created_time,updated_time,daily_budget,lifetime_budget',
      },
    });

    return response.data;
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId: string, updates: Partial<MetaCampaignParams>) {
    const response = await this.client.post(`/${campaignId}`, updates);
    return response.data;
  }

  /**
   * Get all campaigns for the ad account
   */
  async getCampaigns(limit: number = 100, adAccountId?: string) {
    const accountId = adAccountId || this.adAccountId;
    const response = await this.client.get(`/${accountId}/campaigns`, {
      params: {
        fields: 'id,name,objective,status,created_time,daily_budget,lifetime_budget',
        limit,
      },
    });

    return response.data;
  }

  // ============================================
  // AD SETS
  // ============================================

  /**
   * Create an ad set within a campaign
   *
   * IMPORTANT: CBO vs ABO mode
   * - CBO (Campaign Budget Optimization): Budget at campaign level, NO budget/bid_strategy at AdSet level
   * - ABO (Ad Set Budget Optimization): Budget at AdSet level, MUST include bid_strategy
   */
  async createAdSet(params: MetaAdSetParams, adAccountId?: string, accessToken?: string) {
    const accountId = adAccountId || this.adAccountId;
    const payload: any = {
      campaign_id: params.campaign_id,
      name: params.name,
      optimization_goal: params.optimization_goal,
      billing_event: params.billing_event,
      status: params.status || 'PAUSED',
      promoted_object: params.promoted_object,
    };

    // Detect budget mode: CBO vs ABO
    const hasBudget = params.daily_budget !== undefined || params.lifetime_budget !== undefined;
    const isCBO = !hasBudget; // CBO = no budget at AdSet level

    console.log('[META] Creating AdSet:', {
      accountId,
      mode: isCBO ? 'CBO (Campaign Budget Optimization)' : 'ABO (Ad Set Budget Optimization)',
      campaign_id: params.campaign_id,
      name: params.name,
      optimization_goal: params.optimization_goal,
    });

    // Handle budget and bidding based on mode
    if (isCBO) {
      // CBO MODE: No budget or bidding at AdSet level
      // Campaign handles all optimization and bidding automatically
      console.log('[META] CBO Mode: AdSet inherits budget and bidding from campaign');
      // Simply don't set daily_budget, lifetime_budget, or bid_strategy
    } else {
      // ABO MODE: Budget at AdSet level requires bid_strategy
      if (params.daily_budget !== undefined) {
        payload.daily_budget = params.daily_budget;
      }
      if (params.lifetime_budget !== undefined) {
        payload.lifetime_budget = params.lifetime_budget;
      }

      // For ABO with budget, must set appropriate bid_strategy
      const bidStrategy = params.bid_strategy || 'LOWEST_COST_WITH_BID_CAP';
      payload.bid_strategy = bidStrategy;

      // Only include bid_amount for strategies that require it
      if ((bidStrategy === 'COST_CAP' || bidStrategy === 'LOWEST_COST_WITH_BID_CAP') && params.bid_amount !== undefined) {
        payload.bid_amount = params.bid_amount;
      }
      console.log('[META] ABO Mode: Budget at AdSet level with bid_strategy:', bidStrategy);
    }

    // Add timing
    if (params.start_time) payload.start_time = params.start_time;
    if (params.end_time) payload.end_time = params.end_time;

    // Add targeting - preserve all targeting including locales
    if (params.targeting) {
      // Use the targeting as-is from the orchestrator (it already has publisher_platforms)
      payload.targeting = params.targeting;

      // Log targeting details for debugging
      console.log('[META] Targeting received:', JSON.stringify(params.targeting, null, 2));
      console.log('[META] Locales in targeting:', params.targeting.locales);
    } else {
      // If no targeting provided, still enforce placements
      payload.targeting = {
        publisher_platforms: ['facebook', 'instagram', 'messenger'],
      };
    }

    console.log('[META] AdSet Payload:', JSON.stringify(payload, null, 2));

    try {
      const client = this.getClient(accessToken);
      const response = await client.post(`/${accountId}/adsets`, payload);
      console.log('[META] ✅ AdSet created successfully:', {
        id: response.data.id,
        name: payload.name,
        budget_mode: isCBO ? 'CBO' : 'ABO',
      });
      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error || {};
      console.error('[META] ❌ AdSet creation failed:', {
        accountId,
        message: metaError.message || error.message,
        type: metaError.type,
        code: metaError.code,
        error_subcode: metaError.error_subcode,
        fbtrace_id: metaError.fbtrace_id,
        error_user_msg: metaError.error_user_msg,
        error_user_title: metaError.error_user_title,
        fullError: error.response?.data,
        payload,
        hint: isCBO ? 'In CBO mode, budget should be at campaign level only. Do not pass daily_budget or bid_strategy to AdSet.' : 'In ABO mode, ensure bid_strategy is set correctly.'
      });
      throw error;
    }
  }

  /**
   * Get ad set details
   */
  async getAdSet(adSetId: string) {
    const response = await this.client.get(`/${adSetId}`, {
      params: {
        fields: 'id,name,optimization_goal,billing_event,status,daily_budget,lifetime_budget,targeting',
      },
    });

    return response.data;
  }

  /**
   * Update ad set
   */
  async updateAdSet(adSetId: string, updates: Partial<MetaAdSetParams>) {
    const response = await this.client.post(`/${adSetId}`, updates);
    return response.data;
  }

  // ============================================
  // AD CREATIVES
  // ============================================

  /**
   * Upload an image and get hash for ad creative
   */
  async uploadImage(imagePath: string | Buffer, filename?: string, adAccountId?: string, accessToken?: string): Promise<string> {
    const accountId = adAccountId || this.adAccountId;
    const formData = new FormData();

    if (Buffer.isBuffer(imagePath)) {
      formData.append('source', imagePath, filename || 'image.jpg');
    } else {
      formData.append('source', imagePath);
    }

    const response = await axios.post(
      `https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/adimages`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        params: {
          access_token: accessToken || env.META_ACCESS_TOKEN,
        },
      }
    );

    // Response contains the image hash
    const imageHash = response.data.images[Object.keys(response.data.images)[0]].hash;
    return imageHash;
  }

  /**
   * Upload a video
   */
  async uploadVideo(videoPath: string | Buffer, filename?: string, adAccountId?: string, accessToken?: string): Promise<string> {
    const accountId = adAccountId || this.adAccountId;
    const formData = new FormData();

    if (Buffer.isBuffer(videoPath)) {
      formData.append('source', videoPath, filename || 'video.mp4');
    } else {
      formData.append('source', videoPath);
    }

    const response = await axios.post(
      `https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/advideos`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        params: {
          access_token: accessToken || env.META_ACCESS_TOKEN,
        },
      }
    );

    return response.data.id; // Video ID
  }

  /**
   * Create an ad creative
   */
  async createAdCreative(params: MetaAdCreativeParams, adAccountId?: string, accessToken?: string) {
    const accountId = adAccountId || this.adAccountId;
    try {
      const client = this.getClient(accessToken);
      const response = await client.post(`/${accountId}/adcreatives`, params);
      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error || {};
      console.error('[META] ❌ AdCreative creation failed:', {
        accountId,
        message: metaError.message || error.message,
        type: metaError.type,
        code: metaError.code,
        error_subcode: metaError.error_subcode,
        fbtrace_id: metaError.fbtrace_id,
        error_user_msg: metaError.error_user_msg,
        fullError: error.response?.data,
        payload: params
      });
      throw error;
    }
  }

  /**
   * Get ad creative details
   */
  async getAdCreative(creativeId: string) {
    const response = await this.client.get(`/${creativeId}`, {
      params: {
        fields: 'id,name,object_story_spec,image_url,video_id,thumbnail_url',
      },
    });

    return response.data;
  }

  // ============================================
  // ADS
  // ============================================

  /**
   * Create an ad
   */
  async createAd(params: MetaAdParams, adAccountId?: string, accessToken?: string) {
    const accountId = adAccountId || this.adAccountId;
    try {
      const payload: any = {
        name: params.name,
        adset_id: params.adset_id,
        creative: params.creative,
        status: params.status || 'PAUSED',
      };

      if (params.tracking_specs) {
        payload.tracking_specs = params.tracking_specs;
      }

      const client = this.getClient(accessToken);
      const response = await client.post(`/${accountId}/ads`, payload);
      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error || {};
      console.error('[META] ❌ Ad creation failed:', {
        accountId,
        message: metaError.message || error.message,
        type: metaError.type,
        code: metaError.code,
        error_subcode: metaError.error_subcode,
        fbtrace_id: metaError.fbtrace_id,
        error_user_msg: metaError.error_user_msg,
        fullError: error.response?.data,
        payload: {
          name: params.name,
          adset_id: params.adset_id,
          creative: params.creative,
          status: params.status,
        }
      });
      throw error;
    }
  }

  /**
   * Get ad details
   */
  async getAd(adId: string) {
    const response = await this.client.get(`/${adId}`, {
      params: {
        fields: 'id,name,adset_id,creative,status,created_time,updated_time',
      },
    });

    return response.data;
  }

  /**
   * Update ad status
   */
  async updateAdStatus(adId: string, status: 'ACTIVE' | 'PAUSED') {
    const response = await this.client.post(`/${adId}`, { status });
    return response.data;
  }

  // ============================================
  // PIXELS & TRACKING
  // ============================================

  /**
   * Get pixel information
   */
  async getPixel(pixelId: string) {
    const response = await this.client.get(`/${pixelId}`, {
      params: {
        fields: 'id,name,code,creation_time,last_fired_time',
      },
    });

    return response.data;
  }

  /**
   * Create custom conversion
   */
  async createCustomConversion(pixelId: string, name: string, rule: any, adAccountId?: string) {
    const accountId = adAccountId || this.adAccountId;
    const response = await this.client.post(`/${accountId}/customconversions`, {
      pixel_id: pixelId,
      name,
      rule,
      custom_event_type: 'OTHER',
    });

    return response.data;
  }

  // ============================================
  // TARGETING SEARCH
  // ============================================

  /**
   * Search for targeting interests
   */
  async searchTargetingInterests(query: string, limit: number = 10) {
    const response = await this.client.get('/search', {
      params: {
        type: 'adinterest',
        q: query,
        limit,
      },
    });

    return response.data;
  }

  /**
   * Search for targeting behaviors
   */
  async searchTargetingBehaviors(query: string, limit: number = 10) {
    const response = await this.client.get('/search', {
      params: {
        type: 'adbehavior',
        q: query,
        limit,
      },
    });

    return response.data;
  }

  /**
   * Get targeting suggestions based on interests
   */
  async getTargetingSuggestions(interests: string[], adAccountId?: string) {
    const accountId = adAccountId || this.adAccountId;
    const response = await this.client.get(`/${accountId}/targetingsuggestions`, {
      params: {
        interest_list: JSON.stringify(interests),
      },
    });

    return response.data;
  }

  // ============================================
  // INSTAGRAM IDENTITY
  // ============================================

  /**
   * Get Page Access Token from User Access Token
   * Required for certain page-level endpoints like page_backed_instagram_accounts
   */
  async getPageAccessToken(pageId: string, userAccessToken?: string): Promise<string | null> {
    try {
      const client = this.getClient(userAccessToken);
      const response = await client.get(`/${pageId}`, {
        params: {
          fields: 'access_token',
        },
      });

      if (response.data?.access_token) {
        console.log(`[META] ✅ Got Page Access Token for page ${pageId}`);
        return response.data.access_token;
      }

      console.log(`[META] ⚠️ No Page Access Token returned for page ${pageId}`);
      return null;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get Page Access Token:`, error.message);
      return null;
    }
  }

  /**
   * Get the Page-backed Instagram Account ID for a Facebook Page
   * This is used to set "Use Facebook Page as Instagram" in ads
   * When a Page doesn't have a linked Instagram account, Meta creates a "shadow" account
   * that can be used for Instagram ad placements
   *
   * IMPORTANT: This endpoint requires a Page Access Token, not a User Access Token
   */
  async getPageBackedInstagramAccount(pageId: string, userAccessToken?: string): Promise<string | null> {
    try {
      // Step 1: Get Page Access Token (required for this endpoint)
      const pageAccessToken = await this.getPageAccessToken(pageId, userAccessToken);

      if (!pageAccessToken) {
        console.error(`[META] ❌ Cannot get page-backed Instagram account: No Page Access Token available`);
        console.error(`[META] ℹ️ Make sure the app has 'pages_show_list' and 'pages_read_engagement' permissions`);
        return null;
      }

      // Step 2: Use Page Access Token to fetch page_backed_instagram_accounts
      const client = this.getClient(pageAccessToken);
      const response = await client.get(`/${pageId}/page_backed_instagram_accounts`, {
        params: {
          fields: 'id,username',
        },
      });

      if (response.data?.data?.[0]?.id) {
        console.log(`[META] ✅ Found page-backed Instagram account: ${response.data.data[0].id} (username: ${response.data.data[0].username || 'N/A'})`);
        return response.data.data[0].id;
      }

      console.log(`[META] ⚠️ No page-backed Instagram account found for page ${pageId}`);
      return null;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get page-backed Instagram account:`, error.message);
      // Log more details if available
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return null;
    }
  }

  // ============================================
  // INSIGHTS & REPORTING
  // ============================================

  /**
   * Get campaign insights
   */
  async getCampaignInsights(
    campaignId: string,
    datePreset: 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_30d' = 'last_7d'
  ) {
    const response = await this.client.get(`/${campaignId}/insights`, {
      params: {
        date_preset: datePreset,
        fields: 'impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,conversions',
      },
    });

    return response.data;
  }

  /**
   * Get ad set insights
   */
  async getAdSetInsights(adSetId: string, datePreset: string = 'last_7d') {
    const response = await this.client.get(`/${adSetId}/insights`, {
      params: {
        date_preset: datePreset,
        fields: 'impressions,clicks,spend,cpc,cpm,ctr,conversions',
      },
    });

    return response.data;
  }

  /**
   * Get ad insights
   */
  async getAdInsights(adId: string, datePreset: string = 'last_7d') {
    const response = await this.client.get(`/${adId}/insights`, {
      params: {
        date_preset: datePreset,
        fields: 'impressions,clicks,spend,cpc,cpm,ctr,conversions',
      },
    });

    return response.data;
  }

  // ============================================
  // AD ACCOUNTS
  // ============================================

  /**
   * Get all ad accounts accessible by the access token
   */
  async getAdAccounts() {
    const response = await this.client.get('/me/adaccounts', {
      params: {
        fields: 'id,name,account_status,currency,timezone_name,business_name',
        limit: 100,
      },
    });

    return response.data;
  }

  // ============================================
  // PAGES
  // ============================================

  /**
   * Get pages accessible by the access token
   * @param accessToken Optional access token to use instead of the default
   * @returns Array of pages with id, name, and access_token
   */
  async getPages(accessToken?: string): Promise<{ id: string; name: string; access_token?: string }[]> {
    const client = this.getClient(accessToken);
    const response = await client.get('/me/accounts', {
      params: {
        fields: 'id,name,access_token,instagram_business_account',
      },
    });

    return response.data?.data || [];
  }

  /**
   * Get pages that can be promoted by a specific Ad Account
   * This ensures we only return pages the ad account has permission to use
   * @param adAccountId The Ad Account ID (e.g., "act_123456789")
   * @param accessToken Optional access token
   * @returns Array of pages authorized for this ad account
   */
  async getPromotePages(adAccountId: string, accessToken?: string): Promise<{ id: string; name: string }[]> {
    const client = this.getClient(accessToken);
    const response = await client.get(`/${adAccountId}/promote_pages`, {
      params: {
        fields: 'id,name',
      },
    });

    return response.data?.data || [];
  }

  /**
   * Get Instagram business account
   */
  async getInstagramAccount(pageId: string) {
    const response = await this.client.get(`/${pageId}`, {
      params: {
        fields: 'instagram_business_account{id,username,profile_picture_url}',
      },
    });

    return response.data;
  }

  /**
   * Verify if an Ad Account has access to a specific Instagram account
   * This checks against the ad account's authorized Instagram accounts
   * @param adAccountId The Ad Account ID (e.g., "act_123456789")
   * @param instagramAccountId The Instagram Account ID to verify
   * @param accessToken Optional access token
   * @returns true if the ad account has access, false otherwise
   */
  async verifyInstagramAccess(adAccountId: string, instagramAccountId: string, accessToken?: string): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);

      // Get all Instagram accounts the ad account has access to
      const response = await client.get(`/${adAccountId}/instagram_accounts`, {
        params: {
          fields: 'id,username',
        },
      });

      const authorizedAccounts = response.data?.data || [];

      // Check if the requested Instagram account is in the authorized list
      const hasAccess = authorizedAccounts.some((account: { id: string }) => account.id === instagramAccountId);

      if (hasAccess) {
        console.log(`[META] ✅ Ad account ${adAccountId} has access to Instagram account ${instagramAccountId}`);
      } else {
        console.log(`[META] ⚠️ Ad account ${adAccountId} does NOT have access to Instagram account ${instagramAccountId}`);
        console.log(`[META] ℹ️ Authorized Instagram accounts:`, authorizedAccounts.map((a: { id: string; username?: string }) => `${a.id} (${a.username || 'N/A'})`).join(', ') || 'None');
      }

      return hasAccess;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to verify Instagram access:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      // If we can't verify, return false to be safe
      return false;
    }
  }

}

// Export singleton instance
export const metaService = new MetaService();
export default metaService;
