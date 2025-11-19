import axios, { AxiosInstance } from 'axios';
import { env } from '@/lib/env';
import FormData from 'form-data';

/**
 * TikTok Ads API Service
 * Handles campaign creation, ad group configuration, and ad creative management
 *
 * TikTok Hierarchy: Campaign → Ad Group → Ad
 */

export interface TikTokCampaignParams {
  advertiser_id: string;
  campaign_name: string;
  objective_type:
    | 'REACH'
    | 'TRAFFIC'
    | 'VIDEO_VIEWS'
    | 'LEAD_GENERATION'
    | 'ENGAGEMENT'
    | 'APP_PROMOTION'
    | 'WEB_CONVERSIONS'
    | 'PRODUCT_SALES'
    | 'CATALOG_SALES';
  budget_mode?: 'BUDGET_MODE_INFINITE' | 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL';
  budget?: number; // in cents, required if budget_mode is not INFINITE
  special_industries?: string[]; // e.g., ['HOUSING', 'EMPLOYMENT', 'CREDIT']
}

export interface TikTokAdGroupParams {
  advertiser_id: string;
  campaign_id: string;
  adgroup_name: string;
  promotion_type: 'WEBSITE' | 'APP' | 'LIVE' | 'LEAD_GENERATION';
  placement_type?: 'PLACEMENT_TYPE_AUTOMATIC' | 'PLACEMENT_TYPE_NORMAL';
  placements?: string[]; // e.g., ['PLACEMENT_TIKTOK', 'PLACEMENT_PANGLE']

  // Budget & Schedule
  budget_mode?: 'BUDGET_MODE_DAY' | 'BUDGET_MODE_TOTAL' | 'BUDGET_MODE_INFINITE';
  budget?: number; // in cents
  schedule_type?: 'SCHEDULE_TYPE_NORMAL' | 'SCHEDULE_TYPE_ACCELERATED';
  schedule_start_time?: string; // UTC timestamp
  schedule_end_time?: string; // UTC timestamp

  // Optimization
  optimization_goal?:
    | 'CLICK'
    | 'CONVERSION'
    | 'REACH'
    | 'VIDEO_VIEW'
    | 'LEAD_GENERATION'
    | 'ENGAGEMENT';
  billing_event?: 'CPC' | 'CPM' | 'OCPM' | 'CPV';
  bid_type?: 'BID_TYPE_NO_BID' | 'BID_TYPE_CUSTOM';
  bid_price?: number; // in cents

  // Targeting
  location_ids?: string[]; // Country/region codes
  age_groups?: string[]; // e.g., ['AGE_13_17', 'AGE_18_24', 'AGE_25_34']
  gender?: 'GENDER_MALE' | 'GENDER_FEMALE' | 'GENDER_UNLIMITED';
  languages?: string[]; // e.g., ['en', 'es']
  interest_category_ids?: string[];
  operating_systems?: string[]; // e.g., ['ANDROID', 'IOS']

  // Pixel
  pixel_id?: string;
  optimization_event?: string; // e.g., 'COMPLETE_PAYMENT', 'ADD_TO_CART'
}

export interface TikTokAdParams {
  advertiser_id: string;
  adgroup_id: string;
  ad_name: string;
  ad_format: 'SINGLE_IMAGE' | 'SINGLE_VIDEO' | 'CAROUSEL';
  ad_text: string;
  call_to_action?: string; // e.g., 'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP'

  // Landing page
  landing_page_url?: string;
  display_name?: string; // Brand name

  // Creative assets
  image_ids?: string[]; // For SINGLE_IMAGE
  video_id?: string; // For SINGLE_VIDEO

  // Identity
  identity_id?: string; // TikTok identity (account) ID
  identity_type?: 'CUSTOMIZED_USER' | 'AUTH_USER' | 'BC_AUTH_TT';

  // Tracking
  tracking_pixel_id?: string;
  tracking_app_id?: string;
}

export interface TikTokVideoUploadParams {
  advertiser_id: string;
  video_file?: Buffer | string; // File buffer or URL
  video_url?: string;
  upload_type: 'UPLOAD_BY_FILE' | 'UPLOAD_BY_URL' | 'UPLOAD_BY_FILE_ID';
  video_signature?: string; // MD5 hash of file
  flaw_detect?: boolean; // Auto-detect video issues
  auto_fix_enabled?: boolean; // Auto-fix video issues
  auto_bind_enabled?: boolean; // Auto-bind to ad account
}

class TikTokService {
  private client: AxiosInstance;
  private readonly advertiserId: string;

  constructor() {
    this.advertiserId = env.TIKTOK_ADVERTISER_ID || '';

    this.client = axios.create({
      baseURL: 'https://business-api.tiktok.com/open_api/v1.3',
      headers: {
        'Access-Token': env.TIKTOK_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Handle API response and check for errors
   */
  private handleResponse(response: any) {
    if (response.data.code !== 0) {
      throw new Error(
        `TikTok API Error [${response.data.code}]: ${response.data.message}`
      );
    }
    return response.data.data;
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create a new campaign
   */
  async createCampaign(params: TikTokCampaignParams) {
    const response = await this.client.post('/campaign/create/', params);
    return this.handleResponse(response);
  }

  /**
   * Get campaign details
   */
  async getCampaign(campaignId: string) {
    const response = await this.client.get('/campaign/get/', {
      params: {
        advertiser_id: this.advertiserId,
        campaign_ids: JSON.stringify([campaignId]),
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Update campaign
   */
  async updateCampaign(campaignId: string, updates: Partial<TikTokCampaignParams>) {
    const response = await this.client.post('/campaign/update/', {
      advertiser_id: this.advertiserId,
      campaign_id: campaignId,
      ...updates,
    });
    return this.handleResponse(response);
  }

  /**
   * Get all campaigns for the advertiser
   */
  async getCampaigns(page: number = 1, pageSize: number = 100) {
    const response = await this.client.get('/campaign/get/', {
      params: {
        advertiser_id: this.advertiserId,
        page,
        page_size: pageSize,
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Update campaign status
   */
  async updateCampaignStatus(
    campaignId: string,
    optStatus: 'ENABLE' | 'DISABLE' | 'DELETE'
  ) {
    const response = await this.client.post('/campaign/update/status/', {
      advertiser_id: this.advertiserId,
      campaign_ids: [campaignId],
      opt_status: optStatus,
    });
    return this.handleResponse(response);
  }

  // ============================================
  // AD GROUPS
  // ============================================

  /**
   * Create an ad group within a campaign
   */
  async createAdGroup(params: TikTokAdGroupParams) {
    const response = await this.client.post('/adgroup/create/', params);
    return this.handleResponse(response);
  }

  /**
   * Get ad group details
   */
  async getAdGroup(adGroupId: string) {
    const response = await this.client.get('/adgroup/get/', {
      params: {
        advertiser_id: this.advertiserId,
        adgroup_ids: JSON.stringify([adGroupId]),
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Update ad group
   */
  async updateAdGroup(adGroupId: string, updates: Partial<TikTokAdGroupParams>) {
    const response = await this.client.post('/adgroup/update/', {
      advertiser_id: this.advertiserId,
      adgroup_id: adGroupId,
      ...updates,
    });
    return this.handleResponse(response);
  }

  /**
   * Update ad group status
   */
  async updateAdGroupStatus(
    adGroupId: string,
    optStatus: 'ENABLE' | 'DISABLE' | 'DELETE'
  ) {
    const response = await this.client.post('/adgroup/update/status/', {
      advertiser_id: this.advertiserId,
      adgroup_ids: [adGroupId],
      opt_status: optStatus,
    });
    return this.handleResponse(response);
  }

  // ============================================
  // ADS
  // ============================================

  /**
   * Create an ad
   */
  async createAd(params: TikTokAdParams) {
    const response = await this.client.post('/ad/create/', params);
    return this.handleResponse(response);
  }

  /**
   * Get ad details
   */
  async getAd(adId: string) {
    const response = await this.client.get('/ad/get/', {
      params: {
        advertiser_id: this.advertiserId,
        ad_ids: JSON.stringify([adId]),
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Update ad
   */
  async updateAd(adId: string, updates: Partial<TikTokAdParams>) {
    const response = await this.client.post('/ad/update/', {
      advertiser_id: this.advertiserId,
      ad_id: adId,
      ...updates,
    });
    return this.handleResponse(response);
  }

  /**
   * Update ad status
   */
  async updateAdStatus(adId: string, optStatus: 'ENABLE' | 'DISABLE' | 'DELETE') {
    const response = await this.client.post('/ad/status/update/', {
      advertiser_id: this.advertiserId,
      ad_ids: [adId],
      opt_status: optStatus,
    });
    return this.handleResponse(response);
  }

  // ============================================
  // VIDEO UPLOAD & MANAGEMENT
  // ============================================

  /**
   * Upload a video
   */
  async uploadVideo(params: TikTokVideoUploadParams) {
    if (params.upload_type === 'UPLOAD_BY_FILE' && params.video_file) {
      const formData = new FormData();
      formData.append('advertiser_id', params.advertiser_id);
      formData.append('upload_type', params.upload_type);
      formData.append('video_file', params.video_file);

      if (params.video_signature) {
        formData.append('video_signature', params.video_signature);
      }
      if (params.flaw_detect !== undefined) {
        formData.append('flaw_detect', String(params.flaw_detect));
      }
      if (params.auto_fix_enabled !== undefined) {
        formData.append('auto_fix_enabled', String(params.auto_fix_enabled));
      }
      if (params.auto_bind_enabled !== undefined) {
        formData.append('auto_bind_enabled', String(params.auto_bind_enabled));
      }

      const response = await axios.post(
        'https://business-api.tiktok.com/open_api/v1.3/file/video/ad/upload/',
        formData,
        {
          headers: {
            'Access-Token': env.TIKTOK_ACCESS_TOKEN,
            ...formData.getHeaders(),
          },
        }
      );

      return this.handleResponse(response);
    } else if (params.upload_type === 'UPLOAD_BY_URL' && params.video_url) {
      const response = await this.client.post('/file/video/ad/upload/', {
        advertiser_id: params.advertiser_id,
        upload_type: params.upload_type,
        video_url: params.video_url,
      });

      return this.handleResponse(response);
    }

    throw new Error('Invalid video upload parameters');
  }

  /**
   * Get video information
   */
  async getVideo(videoId: string) {
    const response = await this.client.get('/file/video/ad/info/', {
      params: {
        advertiser_id: this.advertiserId,
        video_ids: JSON.stringify([videoId]),
      },
    });
    return this.handleResponse(response);
  }

  // ============================================
  // IMAGE UPLOAD & MANAGEMENT
  // ============================================

  /**
   * Upload an image
   */
  async uploadImage(imageFile: Buffer | string, imageName?: string) {
    const formData = new FormData();
    formData.append('advertiser_id', this.advertiserId);
    formData.append('upload_type', 'UPLOAD_BY_FILE');

    if (Buffer.isBuffer(imageFile)) {
      formData.append('image_file', imageFile, imageName || 'image.jpg');
    } else {
      formData.append('image_file', imageFile);
    }

    const response = await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/',
      formData,
      {
        headers: {
          'Access-Token': env.TIKTOK_ACCESS_TOKEN,
          ...formData.getHeaders(),
        },
      }
    );

    return this.handleResponse(response);
  }

  // ============================================
  // ADVERTISER ACCOUNTS
  // ============================================

  /**
   * Get all advertiser accounts accessible by the access token
   */
  async getAdvertiserAccounts() {
    const response = await axios.get(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/',
      {
        headers: {
          'Access-Token': env.TIKTOK_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
        params: {
          app_id: env.TIKTOK_APP_ID,
          secret: env.TIKTOK_APP_SECRET,
        },
      }
    );
    return this.handleResponse(response);
  }

  // ============================================
  // IDENTITY (TikTok Accounts)
  // ============================================

  /**
   * Get available TikTok identities for ad account
   */
  async getIdentities() {
    const response = await this.client.get('/identity/get/', {
      params: {
        advertiser_id: this.advertiserId,
      },
    });
    return this.handleResponse(response);
  }

  // ============================================
  // PIXELS
  // ============================================

  /**
   * Get pixel information
   */
  async getPixel(pixelId: string) {
    const response = await this.client.get('/pixel/get/', {
      params: {
        advertiser_id: this.advertiserId,
        pixel_id: pixelId,
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Create pixel
   */
  async createPixel(pixelName: string) {
    const response = await this.client.post('/pixel/create/', {
      advertiser_id: this.advertiserId,
      pixel_name: pixelName,
    });
    return this.handleResponse(response);
  }

  // ============================================
  // TARGETING
  // ============================================

  /**
   * Get interest categories for targeting
   */
  async getInterestCategories(
    language: string = 'en',
    specialIndustries?: string[]
  ) {
    const response = await this.client.get('/tool/interest_category/', {
      params: {
        advertiser_id: this.advertiserId,
        language,
        special_industries: specialIndustries
          ? JSON.stringify(specialIndustries)
          : undefined,
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Get recommended interest keywords
   */
  async getInterestKeywords(keywords: string[], language: string = 'en') {
    const response = await this.client.get('/tool/interest_keyword/recommend/', {
      params: {
        advertiser_id: this.advertiserId,
        keyword: keywords.join(','),
        language,
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Get available locations for targeting
   */
  async getLocations(placementType?: string, objectiveType?: string) {
    const response = await this.client.get('/tool/region/', {
      params: {
        advertiser_id: this.advertiserId,
        placement_type: placementType,
        objective_type: objectiveType,
      },
    });
    return this.handleResponse(response);
  }

  // ============================================
  // REPORTING
  // ============================================

  /**
   * Get campaign report
   */
  async getCampaignReport(
    campaignIds: string[],
    startDate: string, // YYYY-MM-DD
    endDate: string,
    metrics: string[] = [
      'campaign_id',
      'campaign_name',
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'cpc',
      'cpm',
      'conversions',
      'conversion_rate',
      'cost_per_conversion',
    ]
  ) {
    const response = await this.client.get('/report/integrated/get/', {
      params: {
        advertiser_id: this.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_CAMPAIGN',
        dimensions: JSON.stringify(['campaign_id']),
        metrics: JSON.stringify(metrics),
        start_date: startDate,
        end_date: endDate,
        filtering: JSON.stringify([
          {
            field_name: 'campaign_id',
            filter_type: 'IN',
            filter_value: campaignIds,
          },
        ]),
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Get ad group report
   */
  async getAdGroupReport(
    adGroupIds: string[],
    startDate: string,
    endDate: string
  ) {
    const response = await this.client.get('/report/integrated/get/', {
      params: {
        advertiser_id: this.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADGROUP',
        dimensions: JSON.stringify(['adgroup_id']),
        metrics: JSON.stringify([
          'spend',
          'impressions',
          'clicks',
          'conversions',
          'ctr',
          'cpc',
          'cpm',
        ]),
        start_date: startDate,
        end_date: endDate,
        filtering: JSON.stringify([
          {
            field_name: 'adgroup_id',
            filter_type: 'IN',
            filter_value: adGroupIds,
          },
        ]),
      },
    });
    return this.handleResponse(response);
  }

  /**
   * Get ad report
   */
  async getAdReport(adIds: string[], startDate: string, endDate: string) {
    const response = await this.client.get('/report/integrated/get/', {
      params: {
        advertiser_id: this.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_AD',
        dimensions: JSON.stringify(['ad_id']),
        metrics: JSON.stringify([
          'spend',
          'impressions',
          'clicks',
          'conversions',
          'ctr',
          'cpc',
          'cpm',
        ]),
        start_date: startDate,
        end_date: endDate,
        filtering: JSON.stringify([
          {
            field_name: 'ad_id',
            filter_type: 'IN',
            filter_value: adIds,
          },
        ]),
      },
    });
    return this.handleResponse(response);
  }
}

// Export singleton instance
export const tiktokService = new TikTokService();
export default tiktokService;
