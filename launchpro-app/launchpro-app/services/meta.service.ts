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
  async getCampaign(campaignId: string, accessToken?: string) {
    const client = this.getClient(accessToken);
    const response = await client.get(`/${campaignId}`, {
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

    const tokenToUse = accessToken || env.META_ACCESS_TOKEN;
    console.log('[META] 📤 uploadImage call:', {
      accountId,
      filename: filename || 'image.jpg',
      hasAccessToken: !!accessToken,
      usingEnvFallback: !accessToken,
      tokenPreview: tokenToUse ? `${tokenToUse.substring(0, 20)}...` : 'NONE',
      bufferSize: Buffer.isBuffer(imagePath) ? imagePath.length : 'N/A',
    });

    try {
      const response = await axios.post(
        `https://graph.facebook.com/${env.META_API_VERSION}/${accountId}/adimages`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          params: {
            access_token: tokenToUse,
          },
        }
      );

      // Response contains the image hash
      const imageHash = response.data.images[Object.keys(response.data.images)[0]].hash;
      console.log('[META] ✅ Image uploaded successfully:', { imageHash, filename });
      return imageHash;
    } catch (error: any) {
      const metaError = error.response?.data?.error || {};
      console.error('[META] ❌ Image upload failed:', {
        accountId,
        filename,
        status: error.response?.status,
        statusText: error.response?.statusText,
        errorMessage: metaError.message || error.message,
        errorType: metaError.type,
        errorCode: metaError.code,
        errorSubcode: metaError.error_subcode,
        errorUserMsg: metaError.error_user_msg,
        fbtraceId: metaError.fbtrace_id,
        fullError: error.response?.data,
      });
      throw error;
    }
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
   * Get all Instagram accounts authorized for an Ad Account
   * These are Instagram accounts the ad account can use for ads
   * @param adAccountId The Ad Account ID (e.g., "act_123456789")
   * @param accessToken Optional access token
   * @returns Array of Instagram accounts with id, username, and profile_picture_url
   */
  async getInstagramAccounts(
    adAccountId: string,
    accessToken?: string
  ): Promise<{ id: string; username: string; profile_picture_url?: string }[]> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get(`/${adAccountId}/instagram_accounts`, {
        params: {
          fields: 'id,username,profile_picture_url',
        },
      });

      const accounts = response.data?.data || [];
      console.log(`[META] Found ${accounts.length} Instagram accounts for ad account ${adAccountId}`);
      return accounts;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to fetch Instagram accounts:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return [];
    }
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

  // ============================================
  // AD RULES - Entity Management & Insights
  // ============================================

  /**
   * Get insights for a specific entity (campaign, ad set, or ad)
   * Used by the ad rules system to evaluate conditions
   * @param entityId The entity ID (campaign, ad set, or ad)
   * @param level The entity level ('campaign', 'adset', 'ad')
   * @param datePreset Time window for insights
   * @param accessToken Optional access token
   */
  async getEntityInsights(
    entityId: string,
    level: 'campaign' | 'adset' | 'ad',
    datePreset: string = 'today',
    accessToken?: string
  ): Promise<{
    spend: number;
    impressions: number;
    clicks: number;
    cpc: number;
    cpm: number;
    ctr: number;
    conversions: number;
    conversionValue: number;
    roas: number;
    cpa: number;
  } | null> {
    try {
      const client = this.getClient(accessToken);

      // Map date preset to Meta API format
      const datePresetMap: Record<string, string> = {
        'TODAY': 'today',
        'LAST_7D': 'last_7d',
        'LAST_14D': 'last_14d',
        'LAST_30D': 'last_30d',
      };
      const metaDatePreset = datePresetMap[datePreset] || datePreset.toLowerCase();

      const response = await client.get(`/${entityId}/insights`, {
        params: {
          date_preset: metaDatePreset,
          fields: 'spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas',
        },
      });

      const data = response.data?.data?.[0];
      if (!data) {
        console.log(`[META] No insights data for ${level} ${entityId}`);
        return null;
      }

      // Extract metrics
      const spend = parseFloat(data.spend || '0');
      const impressions = parseInt(data.impressions || '0');
      const clicks = parseInt(data.clicks || '0');
      const cpc = parseFloat(data.cpc || '0');
      const cpm = parseFloat(data.cpm || '0');
      const ctr = parseFloat(data.ctr || '0');

      // Extract conversions from actions array
      let conversions = 0;
      let conversionValue = 0;

      if (data.actions) {
        // Look for purchase, lead, or other conversion actions
        const conversionAction = data.actions.find((a: any) =>
          a.action_type === 'purchase' ||
          a.action_type === 'lead' ||
          a.action_type === 'omni_purchase'
        );
        if (conversionAction) {
          conversions = parseInt(conversionAction.value || '0');
        }
      }

      if (data.action_values) {
        // Look for purchase value
        const purchaseValue = data.action_values.find((a: any) =>
          a.action_type === 'purchase' ||
          a.action_type === 'omni_purchase'
        );
        if (purchaseValue) {
          conversionValue = parseFloat(purchaseValue.value || '0');
        }
      }

      // Calculate ROAS - use Meta's purchase_roas if available, otherwise calculate
      let roas = 0;
      if (data.purchase_roas && data.purchase_roas.length > 0) {
        roas = parseFloat(data.purchase_roas[0].value || '0');
      } else if (spend > 0 && conversionValue > 0) {
        roas = conversionValue / spend;
      }

      // Calculate CPA
      const cpa = conversions > 0 ? spend / conversions : 0;

      console.log(`[META] Insights for ${level} ${entityId}:`, {
        spend,
        impressions,
        clicks,
        roas,
        cpa,
        conversions,
      });

      return {
        spend,
        impressions,
        clicks,
        cpc,
        cpm,
        ctr,
        conversions,
        conversionValue,
        roas,
        cpa,
      };
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get insights for ${level} ${entityId}:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return null;
    }
  }

  /**
   * Get all active campaigns for an ad account
   * Used by ad rules to get all entities to evaluate
   */
  async getActiveCampaigns(adAccountId: string, accessToken?: string): Promise<Array<{ id: string; name: string; status: string; daily_budget?: string; lifetime_budget?: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get(`/${adAccountId}/campaigns`, {
        params: {
          fields: 'id,name,status,daily_budget,lifetime_budget',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
          limit: 500,
        },
      });

      return response.data?.data || [];
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get active campaigns:`, error.message);
      return [];
    }
  }

  /**
   * Get all active ad sets for an ad account
   */
  async getActiveAdSets(adAccountId: string, accessToken?: string): Promise<Array<{ id: string; name: string; status: string; campaign_id: string; daily_budget?: string; lifetime_budget?: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get(`/${adAccountId}/adsets`, {
        params: {
          fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
          limit: 500,
        },
      });

      return response.data?.data || [];
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get active ad sets:`, error.message);
      return [];
    }
  }

  /**
   * Get all active ads for an ad account
   */
  async getActiveAds(adAccountId: string, accessToken?: string): Promise<Array<{ id: string; name: string; status: string; adset_id: string; campaign_id: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get(`/${adAccountId}/ads`, {
        params: {
          fields: 'id,name,status,adset_id,campaign_id',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
          limit: 500,
        },
      });

      return response.data?.data || [];
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get active ads:`, error.message);
      return [];
    }
  }

  /**
   * Pause an entity (campaign, ad set, or ad)
   */
  async pauseEntity(entityId: string, accessToken?: string): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      await client.post(`/${entityId}`, { status: 'PAUSED' });
      console.log(`[META] ✅ Paused entity ${entityId}`);
      return true;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to pause entity ${entityId}:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return false;
    }
  }

  /**
   * Unpause (activate) an entity (campaign, ad set, or ad)
   */
  async unpauseEntity(entityId: string, accessToken?: string): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      await client.post(`/${entityId}`, { status: 'ACTIVE' });
      console.log(`[META] ✅ Unpaused entity ${entityId}`);
      return true;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to unpause entity ${entityId}:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return false;
    }
  }

  /**
   * Update budget for a campaign (CBO) or ad set (ABO)
   * @param entityId Campaign or Ad Set ID
   * @param newBudget New budget in cents
   * @param budgetType 'daily' or 'lifetime'
   */
  async updateBudget(
    entityId: string,
    newBudget: number,
    budgetType: 'daily' | 'lifetime' = 'daily',
    accessToken?: string
  ): Promise<{ success: boolean; previousBudget?: number; newBudget?: number }> {
    try {
      const client = this.getClient(accessToken);

      // First get current budget
      const currentResponse = await client.get(`/${entityId}`, {
        params: {
          fields: 'daily_budget,lifetime_budget',
        },
      });

      const previousBudget = budgetType === 'daily'
        ? parseInt(currentResponse.data?.daily_budget || '0')
        : parseInt(currentResponse.data?.lifetime_budget || '0');

      // Update budget
      const updatePayload = budgetType === 'daily'
        ? { daily_budget: newBudget }
        : { lifetime_budget: newBudget };

      await client.post(`/${entityId}`, updatePayload);

      console.log(`[META] ✅ Updated ${budgetType} budget for ${entityId}: ${previousBudget} -> ${newBudget}`);

      return {
        success: true,
        previousBudget,
        newBudget,
      };
    } catch (error: any) {
      console.error(`[META] ❌ Failed to update budget for ${entityId}:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return { success: false };
    }
  }

  /**
   * Get budget information for an entity
   */
  async getBudgetInfo(entityId: string, accessToken?: string): Promise<{ daily_budget?: number; lifetime_budget?: number } | null> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get(`/${entityId}`, {
        params: {
          fields: 'daily_budget,lifetime_budget',
        },
      });

      return {
        daily_budget: response.data?.daily_budget ? parseInt(response.data.daily_budget) : undefined,
        lifetime_budget: response.data?.lifetime_budget ? parseInt(response.data.lifetime_budget) : undefined,
      };
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get budget info for ${entityId}:`, error.message);
      return null;
    }
  }

  /**
   * Get spend for all campaigns in an ad account in a single API call
   * Returns a Map of tonicCampaignId -> spend (extracted from campaign name pattern: {tonicId}_{name})
   * This matches how Tonic revenue is keyed, allowing proper Net Revenue calculation
   */
  async getAllCampaignsSpend(
    adAccountId: string,
    datePreset: string = 'THIS_MONTH',
    accessToken?: string
  ): Promise<Map<string, number>> {
    const spendMap = new Map<string, number>();

    try {
      const client = this.getClient(accessToken);

      // Map date preset to Meta API format
      const datePresetMap: Record<string, string> = {
        'TODAY': 'today',
        'YESTERDAY': 'yesterday',
        'LAST_7D': 'last_7d',
        'LAST_14D': 'last_14d',
        'LAST_30D': 'last_30d',
        'THIS_MONTH': 'this_month',
        'LAST_MONTH': 'last_month',
      };
      const metaDatePreset = datePresetMap[datePreset] || datePreset.toLowerCase();

      // Fetch insights for all campaigns at account level
      // Meta API allows filtering by level=campaign to get aggregated data per campaign
      const response = await client.get(`/${adAccountId}/insights`, {
        params: {
          date_preset: metaDatePreset,
          level: 'campaign',
          fields: 'campaign_id,campaign_name,spend',
          limit: 500,
        },
      });

      const insights = response.data?.data || [];

      for (const insight of insights) {
        if (insight.campaign_name) {
          const spend = parseFloat(insight.spend || '0');

          // Extract tonicCampaignId from campaign name pattern: {tonicId}_{name}
          const tonicId = this.extractTonicIdFromCampaignName(insight.campaign_name);

          if (tonicId) {
            // Aggregate spend by tonicId (multiple Meta campaigns can map to same Tonic campaign)
            const currentSpend = spendMap.get(tonicId) || 0;
            spendMap.set(tonicId, currentSpend + spend);
          }
          // Skip campaigns without Tonic ID prefix - they're not from LaunchPro
        }
      }

      console.log(`[META] Fetched spend for ${spendMap.size} campaigns (by tonicId) from account ${adAccountId}`);
      return spendMap;
    } catch (error: any) {
      console.error(`[META] ❌ Failed to get all campaigns spend for ${adAccountId}:`, error.message);
      if (error.response?.data?.error) {
        console.error(`[META] Error details:`, JSON.stringify(error.response.data.error, null, 2));
      }
      return spendMap;
    }
  }

  /**
   * Extract Tonic campaign ID from campaign name
   * Campaign names follow pattern: {tonicCampaignId}_{campaignName}
   * Example: "4193514_TestCampaign" -> "4193514"
   */
  private extractTonicIdFromCampaignName(name: string): string | null {
    const match = name.match(/^(\d+)_/);
    return match ? match[1] : null;
  }

}

// Export singleton instance
export const metaService = new MetaService();
export default metaService;
