import crypto from 'crypto';
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
  operation_status?: 'ENABLE' | 'DISABLE'; // ENABLE = active, DISABLE = paused
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
  schedule_type?: 'SCHEDULE_FROM_NOW' | 'SCHEDULE_START_END';
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

  // Status
  operation_status?: 'ENABLE' | 'DISABLE'; // ENABLE = active, DISABLE = paused
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
  image_ids?: string[]; // For SINGLE_IMAGE and SINGLE_VIDEO (thumbnail/cover image)
  video_id?: string; // For SINGLE_VIDEO
  video_cover_url?: string; // Deprecated: Use image_ids for thumbnails instead

  // Identity
  identity_id?: string; // TikTok identity (account) ID
  identity_type?: 'CUSTOMIZED_USER' | 'AUTH_USER' | 'BC_AUTH_TT';

  // Tracking
  tracking_pixel_id?: string;
  tracking_app_id?: string;

  // Status
  operation_status?: 'ENABLE' | 'DISABLE'; // ENABLE = active, DISABLE = paused
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
  file_name?: string; // Optional file name for UPLOAD_BY_URL
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

    // DEBUG INTERCEPTORS: Track all HTTP requests to identify source of Anthropic-formatted 401 errors
    this.client.interceptors.request.use((config) => {
      console.log('🌐 [TIKTOK HTTP OUT]', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullUrl: `${config.baseURL || ''}${config.url || ''}`,
        headers: Object.keys(config.headers || {}),
      });
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        console.log('🌐 [TIKTOK HTTP IN] Success:', {
          url: response.config.url,
          status: response.status,
          tiktokCode: response.data?.code,
        });
        return response;
      },
      (error) => {
        console.log('🌐 [TIKTOK HTTP ERR] Error:', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: JSON.stringify(error.response?.data || {}).substring(0, 500),
          isAnthropicFormat: error.response?.data?.type === 'error' ||
                            JSON.stringify(error.response?.data || {}).includes('x-api-key'),
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get an authenticated Axios client
   * Uses the provided access token or falls back to the default one
   */
  private getClient(accessToken?: string): AxiosInstance {
    if (!accessToken) {
      return this.client;
    }

    const client = axios.create({
      baseURL: 'https://business-api.tiktok.com/open_api/v1.3',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    // DEBUG INTERCEPTORS for custom token clients
    client.interceptors.request.use((config) => {
      console.log('🌐 [TIKTOK HTTP OUT] (custom token)', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullUrl: `${config.baseURL || ''}${config.url || ''}`,
        headers: Object.keys(config.headers || {}),
      });
      return config;
    });

    client.interceptors.response.use(
      (response) => {
        console.log('🌐 [TIKTOK HTTP IN] (custom token) Success:', {
          url: response.config.url,
          status: response.status,
          tiktokCode: response.data?.code,
        });
        return response;
      },
      (error) => {
        console.log('🌐 [TIKTOK HTTP ERR] (custom token) Error:', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: JSON.stringify(error.response?.data || {}).substring(0, 500),
          isAnthropicFormat: error.response?.data?.type === 'error' ||
                            JSON.stringify(error.response?.data || {}).includes('x-api-key'),
        });
        return Promise.reject(error);
      }
    );

    return client;
  }

  /**
   * Handle API response and check for errors
   */
  private handleResponse(response: any) {
    if (response.data.code !== 0) {
      // Enhanced error logging
      const errorDetails = {
        code: response.data.code,
        message: response.data.message,
        request_id: response.data.request_id,
        data: response.data.data
      };

      console.error('[TikTok API Error]', JSON.stringify(errorDetails, null, 2));

      throw new Error(
        `TikTok API Error [${response.data.code}]: ${response.data.message} (Request ID: ${response.data.request_id || 'N/A'})`
      );
    }
    return response.data.data;
  }

  /**
   * Retry wrapper for API calls with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // DIAGNOSTIC: Log full error details to identify Anthropic-formatted errors
        console.log('🔴 [TikTok API] Error caught:', {
          message: error.message,
          name: error.name,
          code: error.code,
          isAxiosError: error.isAxiosError,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : null,
          requestUrl: error.config?.url,
          requestMethod: error.config?.method,
          containsAnthropicPattern: error.message?.includes('x-api-key') || error.response?.data?.type === 'error',
        });

        // Don't retry on client errors (4xx) except rate limiting (429)
        if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
          // Enhance error message with response data for debugging
          if (error.response.data) {
            const responseStr = typeof error.response.data === 'string'
              ? error.response.data
              : JSON.stringify(error.response.data);
            error.message = `${error.response.status} ${responseStr}`;
          }
          throw error;
        }

        // Log retry attempt
        console.warn(`[TikTok API] Retry attempt ${attempt + 1}/${maxRetries} after error:`, error.message);

        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = delayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // ============================================
  // CAMPAIGNS
  // ============================================

  /**
   * Create a new campaign
   */
  async createCampaign(params: TikTokCampaignParams, accessToken?: string) {
    return this.retryWithBackoff(async () => {
      const client = this.getClient(accessToken);
      const response = await client.post('/campaign/create/', params);
      return this.handleResponse(response);
    });
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
  async createAdGroup(params: TikTokAdGroupParams, accessToken?: string) {
    return this.retryWithBackoff(async () => {
      const client = this.getClient(accessToken);
      const response = await client.post('/adgroup/create/', params);
      return this.handleResponse(response);
    });
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
  async createAd(params: TikTokAdParams, accessToken?: string) {
    return this.retryWithBackoff(async () => {
      const { advertiser_id, adgroup_id, ...creativeParams } = params;

      const payload = {
        advertiser_id,
        adgroup_id,
        creatives: [
          {
            ...creativeParams,
          },
        ],
      };

      const client = this.getClient(accessToken);
      const response = await client.post('/ad/create/', payload);
      const data = this.handleResponse(response);

      // API returns { ad_ids: [...] }
      return { ad_id: data.ad_ids[0] };
    });
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
  async uploadVideo(params: TikTokVideoUploadParams, accessToken?: string) {
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
            'Access-Token': accessToken || env.TIKTOK_ACCESS_TOKEN,
            ...formData.getHeaders(),
          },
        }
      );

      return this.handleResponse(response);
    } else if (params.upload_type === 'UPLOAD_BY_URL' && params.video_url) {
      let finalUrl = params.video_url;

      // Handle Google Drive URLs
      if (finalUrl.includes('drive.google.com')) {
        const match = finalUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
          finalUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (match) {
          finalUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
        }
      }

      const payload: any = {
        advertiser_id: params.advertiser_id,
        upload_type: params.upload_type,
        video_url: finalUrl,
      };

      if (params.file_name) {
        payload.file_name = params.file_name;
      }

      const client = this.getClient(accessToken);
      const response = await client.post('/file/video/ad/upload/', payload);

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

  /**
   * Get video information with custom advertiser_id
   * Returns video details including video_cover_url
   *
   * @param advertiserId - TikTok advertiser ID
   * @param videoId - Video ID to query
   * @param accessToken - Access token for authentication
   * @returns Video info including video_cover_url
   */
  async getVideoInfo(
    advertiserId: string,
    videoId: string,
    accessToken?: string
  ): Promise<{
    video_id: string;
    video_cover_url?: string;
    preview_url?: string;
    duration?: number;
    width?: number;
    height?: number;
    file_name?: string;
    format?: string;
    displayable?: boolean;
  } | null> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get('/file/video/ad/info/', {
        params: {
          advertiser_id: advertiserId,
          video_ids: JSON.stringify([videoId]),
        },
      });

      const result = this.handleResponse(response);
      const videos = result?.list || result;

      if (Array.isArray(videos) && videos.length > 0) {
        return videos[0];
      }

      return null;
    } catch (error: any) {
      console.error('[TikTok] Failed to get video info:', error.message);
      return null;
    }
  }

  // ============================================
  // IMAGE UPLOAD & MANAGEMENT
  // ============================================

  /**
   * Get image information and status from TikTok Asset Library
   * This is crucial to verify image is fully processed before using in ads
   */
  async getImageInfo(imageIds: string[]) {
    try {
      const response = await this.client.get('/file/image/ad/info/', {
        params: {
          advertiser_id: this.advertiserId,
          image_ids: JSON.stringify(imageIds),
        },
      });
      return this.handleResponse(response);
    } catch (error: any) {
      console.error('[TikTok] Failed to get image info:', error.message);
      throw error;
    }
  }

  /**
   * Upload an image to TikTok Ads
   *
   * CRITICAL: TikTok's UPLOAD_BY_URL is more reliable than downloading and re-uploading.
   * This matches the working Google Sheets implementation.
   *
   * @param image - Buffer for direct upload, or URL string for URL-based upload
   * @param imageName - Optional filename
   * @param uploadType - UPLOAD_BY_URL (recommended) or UPLOAD_BY_FILE
   * @param accessToken - Optional access token override
   * @param advertiserId - Optional advertiser ID override (uses default if not provided)
   */
  async uploadImage(
    image: Buffer | string,
    imageName?: string,
    uploadType: 'UPLOAD_BY_FILE' | 'UPLOAD_BY_URL' = 'UPLOAD_BY_URL',
    accessToken?: string,
    advertiserId?: string
  ) {
    const effectiveAdvertiserId = advertiserId || this.advertiserId;

    // UPLOAD_BY_URL: Let TikTok download the image directly (RECOMMENDED)
    if (uploadType === 'UPLOAD_BY_URL' && typeof image === 'string') {
      console.log(`[TikTok] Uploading image via URL: ${image}`);

      // Handle Google Drive URLs - convert to direct download format
      let finalUrl = image;
      if (finalUrl.includes('drive.google.com')) {
        const match = finalUrl.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
          finalUrl.match(/[?&]id=([a-zA-Z0-9-_]+)/);
        if (match) {
          finalUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
          console.log(`[TikTok] Converted Google Drive URL to direct download: ${finalUrl}`);
        }
      }

      // Prepare payload for URL upload
      const payload: any = {
        advertiser_id: effectiveAdvertiserId,
        upload_type: 'UPLOAD_BY_URL',
        image_url: finalUrl,
      };

      // Add filename if provided
      if (imageName) {
        payload.file_name = imageName;
      }

      const client = this.getClient(accessToken);
      const response = await client.post('/file/image/ad/upload/', payload);

      console.log(`[TikTok] Image uploaded successfully via URL`);
      return this.handleResponse(response);
    }

    // UPLOAD_BY_FILE: Upload image buffer directly
    if (!Buffer.isBuffer(image)) {
      throw new Error('[TikTok] UPLOAD_BY_FILE requires a Buffer, but received a string. Use UPLOAD_BY_URL instead.');
    }

    console.log(`[TikTok] Uploading image as file buffer. Size: ${image.length} bytes`);

    // Validate image size (TikTok recommendation: 50KB - 500KB, max: 100MB)
    const sizeMB = image.length / (1024 * 1024);
    if (sizeMB > 100) {
      throw new Error(`[TikTok] Image size (${sizeMB.toFixed(2)}MB) exceeds TikTok's 100MB limit`);
    }
    if (sizeMB < 0.05) {
      console.warn(`[TikTok] Warning: Image size (${(image.length / 1024).toFixed(2)}KB) is very small. Recommended minimum: 50KB`);
    }

    const formData = new FormData();
    formData.append('advertiser_id', effectiveAdvertiserId);
    formData.append('upload_type', 'UPLOAD_BY_FILE');

    // Ensure filename has extension
    let fileName = imageName || 'image.jpg';
    if (!fileName.includes('.')) fileName += '.jpg';

    formData.append('image_file', image, fileName);

    // Calculate MD5 signature (Required for UPLOAD_BY_FILE)
    const signature = crypto.createHash('md5').update(image).digest('hex');
    formData.append('image_signature', signature);

    console.log(`[TikTok] Uploading file: ${fileName}, MD5: ${signature}`);

    const response = await axios.post(
      'https://business-api.tiktok.com/open_api/v1.3/file/image/ad/upload/',
      formData,
      {
        headers: {
          'Access-Token': accessToken || env.TIKTOK_ACCESS_TOKEN,
          ...formData.getHeaders(),
        },
      }
    );

    console.log(`[TikTok] Image uploaded successfully as file`);
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
  async getIdentities(advertiserId?: string, accessToken?: string) {
    const client = this.getClient(accessToken);
    const targetAdvertiserId = advertiserId || this.advertiserId;

    const response = await client.get('/identity/get/', {
      params: {
        advertiser_id: targetAdvertiserId,
        page: 1,
        page_size: 20,
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
  async getPixel(pixelId: string, accessToken?: string) {
    const client = this.getClient(accessToken);
    const response = await client.get('/pixel/get/', {
      params: {
        advertiser_id: this.advertiserId,
        pixel_id: pixelId,
      },
    });
    return this.handleResponse(response);
  }

  /**
   * List all pixels for an advertiser
   * This is critical for auto-fetching pixel IDs when they're not configured
   */
  async listPixels(advertiserId?: string, accessToken?: string) {
    const client = this.getClient(accessToken);
    const targetAdvertiserId = advertiserId || this.advertiserId;

    try {
      console.log(`[TikTok] Fetching pixels for advertiser: ${targetAdvertiserId}`);

      const response = await client.get('/pixel/list/', {
        params: {
          advertiser_id: targetAdvertiserId,
          page: 1,
          page_size: 100,
        },
      });

      const data = this.handleResponse(response);
      console.log(`[TikTok] Found ${data?.list?.length || 0} pixel(s) for advertiser ${targetAdvertiserId}`);

      return data?.list || [];
    } catch (error: any) {
      console.error(`[TikTok] Failed to list pixels for advertiser ${targetAdvertiserId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create pixel
   */
  async createPixel(pixelName: string, accessToken?: string) {
    const client = this.getClient(accessToken);
    const response = await client.post('/pixel/create/', {
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
  // AD RULES - Active Entities & Insights
  // ============================================

  /**
   * Get all ACTIVE campaigns for an advertiser (for ad rules)
   * Returns campaigns with ENABLE status
   */
  async getActiveCampaigns(
    advertiserId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get('/campaign/get/', {
        params: {
          advertiser_id: advertiserId,
          page: 1,
          page_size: 1000,
          filtering: JSON.stringify({
            primary_status: 'STATUS_DELIVERY_OK', // Only delivering campaigns
          }),
        },
      });

      const data = this.handleResponse(response);
      const campaigns = data?.list || [];

      return campaigns
        .filter((c: any) => c.operation_status === 'ENABLE')
        .map((c: any) => ({
          id: c.campaign_id,
          name: c.campaign_name,
          status: c.operation_status,
        }));
    } catch (error: any) {
      console.error('[TikTok] Failed to get active campaigns:', error.message);
      throw error;
    }
  }

  /**
   * Get all ACTIVE ad groups for an advertiser (for ad rules)
   * Returns ad groups with ENABLE status, including their parent campaign_id
   */
  async getActiveAdGroups(
    advertiserId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string; status: string; campaign_id: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get('/adgroup/get/', {
        params: {
          advertiser_id: advertiserId,
          page: 1,
          page_size: 1000,
          filtering: JSON.stringify({
            primary_status: 'STATUS_DELIVERY_OK', // Only delivering ad groups
          }),
        },
      });

      const data = this.handleResponse(response);
      const adGroups = data?.list || [];

      return adGroups
        .filter((a: any) => a.operation_status === 'ENABLE')
        .map((a: any) => ({
          id: a.adgroup_id,
          name: a.adgroup_name,
          status: a.operation_status,
          campaign_id: a.campaign_id,
        }));
    } catch (error: any) {
      console.error('[TikTok] Failed to get active ad groups:', error.message);
      throw error;
    }
  }

  /**
   * Get all ACTIVE ads for an advertiser (for ad rules)
   * Returns ads with ENABLE status, including their parent campaign_id
   */
  async getActiveAds(
    advertiserId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string; status: string; campaign_id: string; adgroup_id: string }>> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.get('/ad/get/', {
        params: {
          advertiser_id: advertiserId,
          page: 1,
          page_size: 1000,
          filtering: JSON.stringify({
            primary_status: 'STATUS_DELIVERY_OK', // Only delivering ads
          }),
        },
      });

      const data = this.handleResponse(response);
      const ads = data?.list || [];

      return ads
        .filter((a: any) => a.operation_status === 'ENABLE')
        .map((a: any) => ({
          id: a.ad_id,
          name: a.ad_name,
          status: a.operation_status,
          campaign_id: a.campaign_id,
          adgroup_id: a.adgroup_id,
        }));
    } catch (error: any) {
      console.error('[TikTok] Failed to get active ads:', error.message);
      throw error;
    }
  }

  /**
   * Get insights/metrics for a specific entity (for ad rules)
   * Similar to Meta's getEntityInsights
   *
   * @param entityId - Campaign, Ad Group, or Ad ID
   * @param level - 'campaign' | 'adgroup' | 'ad'
   * @param datePreset - 'today' | 'yesterday' | 'last_7d' | 'last_30d'
   * @param accessToken - TikTok access token
   * @param advertiserId - TikTok advertiser ID
   */
  async getEntityInsights(
    entityId: string,
    level: 'campaign' | 'adgroup' | 'ad',
    datePreset: string,
    accessToken: string,
    advertiserId: string
  ): Promise<{
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
    conversions: number;
    cpa: number;
    roas: number; // TikTok doesn't provide ROAS, will be 0
  } | null> {
    try {
      const client = this.getClient(accessToken);

      // Convert date preset to actual dates
      const { startDate, endDate } = this.getDateRangeFromPreset(datePreset);

      // Map level to TikTok data_level
      const dataLevelMap: Record<string, string> = {
        campaign: 'AUCTION_CAMPAIGN',
        adgroup: 'AUCTION_ADGROUP',
        ad: 'AUCTION_AD',
      };

      // Map level to field name for filtering
      const fieldNameMap: Record<string, string> = {
        campaign: 'campaign_id',
        adgroup: 'adgroup_id',
        ad: 'ad_id',
      };

      // Map level to dimension
      const dimensionMap: Record<string, string> = {
        campaign: 'campaign_id',
        adgroup: 'adgroup_id',
        ad: 'ad_id',
      };

      const response = await client.get('/report/integrated/get/', {
        params: {
          advertiser_id: advertiserId,
          report_type: 'BASIC',
          data_level: dataLevelMap[level],
          dimensions: JSON.stringify([dimensionMap[level]]),
          metrics: JSON.stringify([
            'spend',
            'impressions',
            'clicks',
            'ctr',
            'cpc',
            'cpm',
            'conversions',
            'cost_per_conversion',
          ]),
          start_date: startDate,
          end_date: endDate,
          filtering: JSON.stringify([
            {
              field_name: fieldNameMap[level],
              filter_type: 'IN',
              filter_value: [entityId],
            },
          ]),
        },
      });

      const data = this.handleResponse(response);
      const rows = data?.list || [];

      if (rows.length === 0) {
        return null;
      }

      const metrics = rows[0].metrics || rows[0];

      return {
        spend: parseFloat(metrics.spend) || 0,
        impressions: parseInt(metrics.impressions) || 0,
        clicks: parseInt(metrics.clicks) || 0,
        ctr: parseFloat(metrics.ctr) || 0,
        cpc: parseFloat(metrics.cpc) || 0,
        cpm: parseFloat(metrics.cpm) || 0,
        conversions: parseInt(metrics.conversions) || 0,
        cpa: parseFloat(metrics.cost_per_conversion) || 0,
        roas: 0, // TikTok doesn't provide ROAS - will be calculated with Tonic
      };
    } catch (error: any) {
      console.error(`[TikTok] Failed to get entity insights for ${level} ${entityId}:`, error.message);
      return null;
    }
  }

  /**
   * Get metrics for ALL campaigns in a single API call
   * Returns a Map of tonicCampaignId -> spend (extracted from campaign name pattern: {tonicId}_{name})
   * This matches how Tonic revenue is keyed, allowing proper Net Revenue calculation
   */
  async getAllCampaignsSpend(
    advertiserId: string,
    accessToken: string,
    datePreset: string
  ): Promise<Map<string, number>> {
    const spendMap = new Map<string, number>();

    try {
      const client = this.getClient(accessToken);
      const { startDate, endDate } = this.getDateRangeFromPreset(datePreset);

      console.log(`[TikTok] Fetching ALL campaign spend for ${advertiserId}, dates: ${startDate} to ${endDate}`);

      // Step 1: Get all campaign names to extract tonicIds
      const campaignNamesMap = new Map<string, string>(); // campaign_id -> campaign_name
      try {
        const campaignsResponse = await client.get('/campaign/get/', {
          params: {
            advertiser_id: advertiserId,
            page: 1,
            page_size: 1000,
          },
        });
        const campaignsData = this.handleResponse(campaignsResponse);
        for (const campaign of campaignsData?.list || []) {
          if (campaign.campaign_id && campaign.campaign_name) {
            campaignNamesMap.set(campaign.campaign_id, campaign.campaign_name);
          }
        }
        console.log(`[TikTok] Fetched ${campaignNamesMap.size} campaign names`);
      } catch (nameError: any) {
        console.error(`[TikTok] Failed to fetch campaign names:`, nameError.message);
      }

      // Step 2: Get spend data from report API
      const response = await client.get('/report/integrated/get/', {
        params: {
          advertiser_id: advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: JSON.stringify(['campaign_id']),
          metrics: JSON.stringify(['spend', 'impressions', 'clicks']),
          start_date: startDate,
          end_date: endDate,
          page_size: 1000,
        },
      });

      const data = this.handleResponse(response);
      const rows = data?.list || [];

      console.log(`[TikTok] Got ${rows.length} campaign rows from report API`);

      // Step 3: Map spend by tonicId extracted from campaign name
      for (const row of rows) {
        const campaignId = row.dimensions?.campaign_id;
        const spend = parseFloat(row.metrics?.spend) || 0;

        if (campaignId) {
          const campaignName = campaignNamesMap.get(campaignId);
          if (campaignName) {
            const tonicId = this.extractTonicIdFromCampaignName(campaignName);
            if (tonicId) {
              // Aggregate spend by tonicId
              const currentSpend = spendMap.get(tonicId) || 0;
              spendMap.set(tonicId, currentSpend + spend);
              console.log(`[TikTok] Campaign "${campaignName}" (tonicId: ${tonicId}): spend=$${spend.toFixed(2)}`);
            }
            // Skip campaigns without Tonic ID prefix - they're not from LaunchPro
          }
        }
      }

      console.log(`[TikTok] Aggregated spend for ${spendMap.size} campaigns (by tonicId)`);
      return spendMap;
    } catch (error: any) {
      console.error(`[TikTok] Failed to get all campaigns spend:`, error.message);
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

  /**
   * Convert date preset string to start/end dates
   */
  private getDateRangeFromPreset(datePreset: string): { startDate: string; endDate: string } {
    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    switch (datePreset.toLowerCase()) {
      case 'today':
        return { startDate: formatDate(now), endDate: formatDate(now) };

      case 'yesterday': {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) };
      }

      case 'last_7d':
      case 'last7days': {
        const start = new Date(now);
        start.setDate(start.getDate() - 6);
        return { startDate: formatDate(start), endDate: formatDate(now) };
      }

      case 'last_30d':
      case 'last30days': {
        const start = new Date(now);
        start.setDate(start.getDate() - 29);
        return { startDate: formatDate(start), endDate: formatDate(now) };
      }

      default:
        return { startDate: formatDate(now), endDate: formatDate(now) };
    }
  }

  /**
   * Update campaign status (for ad rules - PAUSE/UNPAUSE)
   * Wrapper for multi-account support
   */
  async updateCampaignStatusForRule(
    campaignId: string,
    status: 'ENABLE' | 'DISABLE',
    advertiserId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.post('/campaign/status/update/', {
        advertiser_id: advertiserId,
        campaign_ids: [campaignId],
        operation_status: status,
      });
      this.handleResponse(response);
      return true;
    } catch (error: any) {
      console.error(`[TikTok] Failed to update campaign ${campaignId} status:`, error.message);
      throw error;
    }
  }

  /**
   * Update ad group status (for ad rules - PAUSE/UNPAUSE)
   */
  async updateAdGroupStatusForRule(
    adGroupId: string,
    status: 'ENABLE' | 'DISABLE',
    advertiserId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.post('/adgroup/status/update/', {
        advertiser_id: advertiserId,
        adgroup_ids: [adGroupId],
        operation_status: status,
      });
      this.handleResponse(response);
      return true;
    } catch (error: any) {
      console.error(`[TikTok] Failed to update ad group ${adGroupId} status:`, error.message);
      throw error;
    }
  }

  /**
   * Update ad status (for ad rules - PAUSE/UNPAUSE)
   */
  async updateAdStatusForRule(
    adId: string,
    status: 'ENABLE' | 'DISABLE',
    advertiserId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.post('/ad/status/update/', {
        advertiser_id: advertiserId,
        ad_ids: [adId],
        operation_status: status,
      });
      this.handleResponse(response);
      return true;
    } catch (error: any) {
      console.error(`[TikTok] Failed to update ad ${adId} status:`, error.message);
      throw error;
    }
  }

  /**
   * Update campaign budget (for ad rules - INCREASE/DECREASE_BUDGET)
   * TikTok budgets are in DOLLARS (not cents like Meta)
   */
  async updateCampaignBudgetForRule(
    campaignId: string,
    newBudget: number, // In dollars
    advertiserId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.post('/campaign/update/', {
        advertiser_id: advertiserId,
        campaign_id: campaignId,
        budget: newBudget, // TikTok accepts dollars directly
      });
      this.handleResponse(response);
      return true;
    } catch (error: any) {
      console.error(`[TikTok] Failed to update campaign ${campaignId} budget:`, error.message);
      throw error;
    }
  }

  /**
   * Update ad group budget (for ad rules - INCREASE/DECREASE_BUDGET)
   * TikTok budgets are in DOLLARS (not cents like Meta)
   */
  async updateAdGroupBudgetForRule(
    adGroupId: string,
    newBudget: number, // In dollars
    advertiserId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(accessToken);
      const response = await client.post('/adgroup/update/', {
        advertiser_id: advertiserId,
        adgroup_id: adGroupId,
        budget: newBudget, // TikTok accepts dollars directly
      });
      this.handleResponse(response);
      return true;
    } catch (error: any) {
      console.error(`[TikTok] Failed to update ad group ${adGroupId} budget:`, error.message);
      throw error;
    }
  }

  /**
   * Get budget info for an entity (for ad rules simulation)
   */
  async getBudgetInfo(
    entityId: string,
    level: 'campaign' | 'adgroup',
    advertiserId: string,
    accessToken: string
  ): Promise<{ budget: number; budget_mode: string } | null> {
    try {
      const client = this.getClient(accessToken);

      if (level === 'campaign') {
        const response = await client.get('/campaign/get/', {
          params: {
            advertiser_id: advertiserId,
            campaign_ids: JSON.stringify([entityId]),
          },
        });
        const data = this.handleResponse(response);
        const campaign = data?.list?.[0];
        if (campaign) {
          return {
            budget: campaign.budget || 0, // Already in dollars
            budget_mode: campaign.budget_mode || 'BUDGET_MODE_DAY',
          };
        }
      } else {
        const response = await client.get('/adgroup/get/', {
          params: {
            advertiser_id: advertiserId,
            adgroup_ids: JSON.stringify([entityId]),
          },
        });
        const data = this.handleResponse(response);
        const adGroup = data?.list?.[0];
        if (adGroup) {
          return {
            budget: adGroup.budget || 0, // Already in dollars
            budget_mode: adGroup.budget_mode || 'BUDGET_MODE_DAY',
          };
        }
      }

      return null;
    } catch (error: any) {
      console.error(`[TikTok] Failed to get budget info for ${level} ${entityId}:`, error.message);
      return null;
    }
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

  /**
   * Get Location ID for a country code
   * Uses GeoNames IDs - e.g., 'CO' -> '3686110' (Colombia country ID)
   * Note: 3685413 is Cundinamarca (region), 3686110 is Colombia (country)
   */
  async getLocationId(countryCode: string): Promise<string> {
    // Fallback map for common countries using correct COUNTRY level IDs (GeoNames)
    // These are verified country-level IDs, not region IDs
    const countryIdMap: Record<string, string> = {
      // Latin America (TG accounts)
      'CO': '3686110', // Colombia (country) - NOT 3685413 which is Cundinamarca
      'US': '6252001', // United States
      'MX': '3996063', // Mexico
      'ES': '2510769', // Spain
      'AR': '3865483', // Argentina
      'CL': '3895114', // Chile
      'PE': '3932488', // Peru
      'BR': '3469034', // Brazil
      'EC': '3658394', // Ecuador
      'VE': '3625428', // Venezuela
      'PA': '3703430', // Panama
      'CR': '3624060', // Costa Rica
      'GT': '3595528', // Guatemala
      'HN': '3608932', // Honduras
      'SV': '3585968', // El Salvador
      'NI': '3617476', // Nicaragua
      'DO': '3508796', // Dominican Republic
      'PR': '4566966', // Puerto Rico
      'UY': '3439705', // Uruguay
      'PY': '3437598', // Paraguay
      'BO': '3923057', // Bolivia
      // Anglo/English-speaking countries (TY accounts)
      'ZA': '953987',  // South Africa
      'GB': '2635167', // United Kingdom
      'AU': '2077456', // Australia
      'CA': '6251999', // Canada
      'NZ': '2186224', // New Zealand
      'IE': '2963597', // Ireland
      'PH': '1694008', // Philippines
      'IN': '1269750', // India
      'PK': '1168579', // Pakistan
      'NG': '2328926', // Nigeria
      'KE': '192950',  // Kenya
      'GH': '2300660', // Ghana
      'EG': '357994',  // Egypt
      'MY': '1733045', // Malaysia
      'SG': '1880251', // Singapore
    };

    try {
      const response = await this.client.get('/tool/region/', {
        params: {
          advertiser_id: this.advertiserId,
          region_level: 'COUNTRY',
          placement_type: 'PLACEMENT_TYPE_NORMAL',
          placements: JSON.stringify(['PLACEMENT_TIKTOK']),
          objective_type: 'LEAD_GENERATION',
        },
      });

      const data = this.handleResponse(response);

      if (data && data.list) {
        const country = data.list.find((c: any) => c.region_code === countryCode);
        if (country) {
          console.log(`[TikTok] Found location ID for ${countryCode}: ${country.location_id}`);
          return country.location_id;
        }
      }

      // Use fallback map if API doesn't return the country
      if (countryIdMap[countryCode]) {
        console.log(`[TikTok] Using fallback location ID for ${countryCode}: ${countryIdMap[countryCode]}`);
        return countryIdMap[countryCode];
      }

      throw new Error(`Location ID not found for country code: ${countryCode}`);
    } catch (error: any) {
      console.error('Failed to fetch location ID:', error.message);
      // Use fallback map on error
      if (countryIdMap[countryCode]) {
        console.log(`[TikTok] Using fallback location ID for ${countryCode} after error: ${countryIdMap[countryCode]}`);
        return countryIdMap[countryCode];
      }
      throw error;
    }
  }

  /**
   * Get Location IDs for multiple country codes
   * Used for WORLDWIDE targeting where we need all 87 allowed countries
   * Returns only the countries that have valid location IDs
   */
  async getLocationIds(countryCodes: string[]): Promise<string[]> {
    const locationIds: string[] = [];
    const failedCountries: string[] = [];

    for (const code of countryCodes) {
      try {
        const locationId = await this.getLocationId(code);
        locationIds.push(locationId);
      } catch (error) {
        failedCountries.push(code);
        console.warn(`[TikTok] Could not get location ID for ${code}, skipping`);
      }
    }

    if (failedCountries.length > 0) {
      console.log(`[TikTok] Skipped ${failedCountries.length} countries without location IDs: ${failedCountries.join(', ')}`);
    }

    console.log(`[TikTok] Resolved ${locationIds.length} location IDs for ${countryCodes.length} countries`);
    return locationIds;
  }
}

// Export singleton instance
export const tiktokService = new TikTokService();
export default tiktokService;
