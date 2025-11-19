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
}

export interface MetaAdSetParams {
  campaign_id: string;
  name: string;
  optimization_goal: string; // e.g., 'IMPRESSIONS', 'LINK_CLICKS', 'CONVERSIONS'
  billing_event: string; // e.g., 'IMPRESSIONS', 'LINK_CLICKS'
  bid_amount?: number; // in cents
  daily_budget?: number; // in cents (if not CBO)
  lifetime_budget?: number; // in cents
  start_time?: string; // ISO 8601 format
  end_time?: string; // ISO 8601 format
  targeting?: MetaTargeting;
  status?: 'ACTIVE' | 'PAUSED';
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
}

export interface MetaAdCreativeParams {
  name: string;
  object_story_spec?: {
    page_id: string;
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

  constructor(adAccountId?: string) {
    this.adAccountId = adAccountId || env.META_AD_ACCOUNT_ID;

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
   * Create a new MetaService instance with a specific ad account
   */
  static withAccount(adAccountId: string): MetaService {
    return new MetaService(adAccountId);
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create a new campaign
   */
  async createCampaign(params: MetaCampaignParams) {
    const response = await this.client.post(`/${this.adAccountId}/campaigns`, {
      name: params.name,
      objective: params.objective,
      status: params.status || 'PAUSED',
      special_ad_categories: params.special_ad_categories || [],
    });

    return response.data;
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
  async getCampaigns(limit: number = 100) {
    const response = await this.client.get(`/${this.adAccountId}/campaigns`, {
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
   */
  async createAdSet(params: MetaAdSetParams) {
    const response = await this.client.post(`/${this.adAccountId}/adsets`, {
      campaign_id: params.campaign_id,
      name: params.name,
      optimization_goal: params.optimization_goal,
      billing_event: params.billing_event,
      bid_amount: params.bid_amount,
      daily_budget: params.daily_budget,
      lifetime_budget: params.lifetime_budget,
      start_time: params.start_time,
      end_time: params.end_time,
      targeting: params.targeting,
      status: params.status || 'PAUSED',
    });

    return response.data;
  }

  /**
   * Get ad set details
   */
  async getAdSet(adSetId: string) {
    const response = await this.client.get(`/${adSetId}`, {
      params: {
        fields:
          'id,name,campaign_id,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,status,start_time,end_time',
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
  async uploadImage(imagePath: string | Buffer, filename?: string): Promise<string> {
    const formData = new FormData();

    if (Buffer.isBuffer(imagePath)) {
      formData.append('source', imagePath, filename || 'image.jpg');
    } else {
      formData.append('source', imagePath);
    }

    const response = await axios.post(
      `https://graph.facebook.com/${env.META_API_VERSION}/${this.adAccountId}/adimages`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        params: {
          access_token: env.META_ACCESS_TOKEN,
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
  async uploadVideo(videoPath: string | Buffer, filename?: string): Promise<string> {
    const formData = new FormData();

    if (Buffer.isBuffer(videoPath)) {
      formData.append('source', videoPath, filename || 'video.mp4');
    } else {
      formData.append('source', videoPath);
    }

    const response = await axios.post(
      `https://graph.facebook.com/${env.META_API_VERSION}/${this.adAccountId}/advideos`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        params: {
          access_token: env.META_ACCESS_TOKEN,
        },
      }
    );

    return response.data.id; // Video ID
  }

  /**
   * Create an ad creative
   */
  async createAdCreative(params: MetaAdCreativeParams) {
    const response = await this.client.post(`/${this.adAccountId}/adcreatives`, params);
    return response.data;
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
  async createAd(params: MetaAdParams) {
    const response = await this.client.post(`/${this.adAccountId}/ads`, {
      name: params.name,
      adset_id: params.adset_id,
      creative: params.creative,
      status: params.status || 'PAUSED',
      tracking_specs: params.tracking_specs,
    });

    return response.data;
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
  async createCustomConversion(pixelId: string, name: string, rule: any) {
    const response = await this.client.post(`/${this.adAccountId}/customconversions`, {
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
  async getTargetingSuggestions(interests: string[]) {
    const response = await this.client.get(`/${this.adAccountId}/targetingsuggestions`, {
      params: {
        interest_list: JSON.stringify(interests),
      },
    });

    return response.data;
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
   */
  async getPages() {
    const response = await this.client.get('/me/accounts', {
      params: {
        fields: 'id,name,access_token,instagram_business_account',
      },
    });

    return response.data;
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
}

// Export singleton instance
export const metaService = new MetaService();
export default metaService;
