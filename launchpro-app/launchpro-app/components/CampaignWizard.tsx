'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Simple log interface for inline display
interface LaunchLog {
  id: string;
  message: string;
  status: 'pending' | 'in_progress' | 'success' | 'error';
  timestamp: Date;
}

interface Offer {
  id: string;
  name: string;
  vertical?: string;
}

interface Country {
  code: string;
  name: string;
}

interface Account {
  id: string;
  name: string;
  accountType: 'TONIC' | 'META' | 'TIKTOK';
  tonicConsumerKey?: string;
  metaAdAccountId?: string;
  metaPortfolio?: string;
  tiktokAdvertiserId?: string;
  linkedTonicAccountId?: string;
  isActive: boolean;
}

interface PlatformConfig {
  platform: 'META' | 'TIKTOK';
  accountId?: string;
  performanceGoal: string;
  budget: string;
  startDateTime: string;  // Changed from startDate to include time
  generateWithAI: boolean;
  uploadedImages?: UploadedFile[];
  uploadedVideos?: UploadedFile[];
  specialAdCategories?: string[];
  // Manual Ad Copy fields (Meta only)
  manualAdTitle?: string;
  manualDescription?: string;
  manualPrimaryText?: string;
  // Manual Ad Copy fields (TikTok)
  manualTiktokAdText?: string;
  // Fan Page for Meta (user selectable)
  metaPageId?: string;
  // Identity for TikTok (user selectable)
  tiktokIdentityId?: string;
  tiktokIdentityType?: string;
}

interface UploadedFile {
  id: string;
  url: string;
  fileName: string;
  fileSize: number;
  type: 'IMAGE' | 'VIDEO';
  // For videos: associated thumbnail (Meta requires thumbnail for video ads)
  thumbnailId?: string;
  thumbnailUrl?: string;
  thumbnailFileName?: string;
}

export default function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unique session ID to namespace temp files (prevents race conditions when creating multiple campaigns)
  const [wizardSessionId, setWizardSessionId] = useState(() => `wizard-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);

  // Estado para logs inline durante el lanzamiento
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchLogs, setLaunchLogs] = useState<LaunchLog[]>([]);
  const [launchComplete, setLaunchComplete] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [launchedCampaignId, setLaunchedCampaignId] = useState<string | null>(null);

  // Data from APIs
  const [offers, setOffers] = useState<Offer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [tonicAccounts, setTonicAccounts] = useState<Account[]>([]);
  const [metaAccounts, setMetaAccounts] = useState<Account[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<Account[]>([]);

  // Ad accounts from Meta/TikTok APIs (not from local DB)
  const [metaAdAccounts, setMetaAdAccounts] = useState<any[]>([]);
  const [tiktokAdvertiserAccounts, setTiktokAdvertiserAccounts] = useState<any[]>([]);

  // Fan Pages for Meta (loaded when Meta account is selected)
  const [metaPages, setMetaPages] = useState<{ id: string; name: string }[]>([]);
  const [loadingMetaPages, setLoadingMetaPages] = useState(false);

  // Identities for TikTok (loaded when TikTok account is selected)
  const [tiktokIdentities, setTiktokIdentities] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loadingTiktokIdentities, setLoadingTiktokIdentities] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    campaignType: 'CBO' as 'CBO' | 'ABO',
    tonicAccountId: '',
    offerId: '',
    country: '',
    language: 'en',
    copyMaster: '',
    communicationAngle: '',
    keywords: [] as string[],
    contentGenerationPhrases: [] as string[],
    platforms: [] as PlatformConfig[],
  });

  // Local state for text inputs that need onBlur conversion
  const [keywordsText, setKeywordsText] = useState('');
  const [contentPhrasesText, setContentPhrasesText] = useState('');

  // Helper functions to manage namespaced temp files (prevents race conditions)
  const getTempFilesNamespace = () => {
    if (!(window as any).__tempFiles) {
      (window as any).__tempFiles = {};
    }
    if (!(window as any).__tempFiles[wizardSessionId]) {
      (window as any).__tempFiles[wizardSessionId] = {};
    }
    return (window as any).__tempFiles[wizardSessionId];
  };

  const setTempFile = (fileId: string, file: File) => {
    const namespace = getTempFilesNamespace();
    namespace[fileId] = file;
  };

  const getTempFile = (fileId: string): File | undefined => {
    const namespace = getTempFilesNamespace();
    return namespace[fileId];
  };

  const deleteTempFile = (fileId: string) => {
    const namespace = getTempFilesNamespace();
    if (namespace[fileId]) {
      delete namespace[fileId];
    }
  };

  const getAllTempFileIds = (): string[] => {
    const namespace = getTempFilesNamespace();
    return Object.keys(namespace);
  };

  const clearTempFilesNamespace = () => {
    if ((window as any).__tempFiles && (window as any).__tempFiles[wizardSessionId]) {
      delete (window as any).__tempFiles[wizardSessionId];
    }
  };

  // Load offers and accounts on mount
  useEffect(() => {
    loadOffers();
    loadAccounts();
    loadAdAccounts();
  }, []);

  // Load countries when offer is selected
  useEffect(() => {
    if (formData.offerId) {
      loadCountries();
    }
  }, [formData.offerId]);

  // Auto-select language based on country
  useEffect(() => {
    if (!formData.country) return;

    const countryLanguageMap: Record<string, string> = {
      'CO': 'es', // Colombia
      'MX': 'es', // Mexico
      'ES': 'es', // Spain
      'AR': 'es', // Argentina
      'CL': 'es', // Chile
      'PE': 'es', // Peru
      'EC': 'es', // Ecuador
      'VE': 'es', // Venezuela
      'GT': 'es', // Guatemala
      'CR': 'es', // Costa Rica
      'US': 'en', // United States
      'GB': 'en', // United Kingdom
      'CA': 'en', // Canada
      'AU': 'en', // Australia
      'DE': 'de', // Germany
      'AT': 'de', // Austria
      'CH': 'de', // Switzerland
      'FR': 'fr', // France
      'BR': 'pt', // Brazil
      'PT': 'pt', // Portugal
    };

    const defaultLang = countryLanguageMap[formData.country];
    if (defaultLang) {
      handleInputChange('language', defaultLang);
    }
  }, [formData.country]);

  const loadOffers = async () => {
    try {
      const res = await fetch('/api/offers');
      const data = await res.json();
      if (data.success) {
        setOffers(data.data);
      }
    } catch (err: any) {
      console.error('Error loading offers:', err);
    }
  };

  const loadCountries = async () => {
    try {
      const res = await fetch(`/api/countries?offerId=${formData.offerId}`);
      const data = await res.json();
      if (data.success) {
        setCountries(data.data);
      }
    } catch (err: any) {
      console.error('Error loading countries:', err);
    }
  };

  const loadAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setTonicAccounts(data.data.tonic || []);
        setMetaAccounts(data.data.meta?.all || []);
        setTiktokAccounts(data.data.tiktok || []);
      }
    } catch (err: any) {
      console.error('Error loading accounts:', err);
    }
  };

  const loadAdAccounts = async () => {
    try {
      const res = await fetch('/api/ad-accounts');
      const data = await res.json();
      if (data.success) {
        setMetaAdAccounts(data.data.meta || []);
        setTiktokAdvertiserAccounts(data.data.tiktok || []);
      }
    } catch (err: any) {
      console.error('Error loading ad accounts from APIs:', err);
    }
  };

  // Load Fan Pages for a Meta account
  const loadMetaPages = async (accountId: string) => {
    if (!accountId) {
      setMetaPages([]);
      return;
    }

    setLoadingMetaPages(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/pages`);
      const data = await res.json();
      if (data.success) {
        setMetaPages(data.data || []);
      } else {
        console.error('Error loading Meta pages:', data.error);
        setMetaPages([]);
      }
    } catch (err: any) {
      console.error('Error loading Meta pages:', err);
      setMetaPages([]);
    } finally {
      setLoadingMetaPages(false);
    }
  };

  // Load Identities for a TikTok account
  const loadTiktokIdentities = async (accountId: string) => {
    if (!accountId) {
      setTiktokIdentities([]);
      return;
    }

    setLoadingTiktokIdentities(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/identities`);
      const data = await res.json();
      if (data.success) {
        setTiktokIdentities(data.data || []);
      } else {
        console.error('Error loading TikTok identities:', data.error);
        setTiktokIdentities([]);
      }
    } catch (err: any) {
      console.error('Error loading TikTok identities:', err);
      setTiktokIdentities([]);
    } finally {
      setLoadingTiktokIdentities(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addPlatform = (platform: 'META' | 'TIKTOK') => {
    // Default to tomorrow at 6:00 AM UTC
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);
    const defaultDateTime = tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm

    const newPlatform: PlatformConfig = {
      platform,
      performanceGoal: platform === 'META' ? 'Lead Generation' : 'Lead Generation',
      budget: '100',
      startDateTime: defaultDateTime,
      generateWithAI: true,
      specialAdCategories: [],
    };
    setFormData((prev) => ({
      ...prev,
      platforms: [...prev.platforms, newPlatform],
    }));
  };

  const removePlatform = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.filter((_, i) => i !== index),
    }));
  };

  const updatePlatform = (index: number, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p, i) =>
        i === index ? { ...p, [field]: value } : p
      ),
    }));
  };

  /**
   * Handle manual file upload for images/videos
   * Uploads files to the API and stores metadata in the platform config
   */
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    platformIndex: number,
    mediaType: 'IMAGE' | 'VIDEO'
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Note: Campaign must be created first to upload files
      // For now, we'll store the files in memory and upload them after campaign creation
      // Alternative: Create campaign as DRAFT first, then upload files

      const uploadedFiles: UploadedFile[] = [];

      for (const file of Array.from(files)) {
        // Client-side validation
        const maxSize = mediaType === 'IMAGE' ? 30 * 1024 * 1024 : 500 * 1024 * 1024;
        if (file.size > maxSize) {
          setError(
            `File ${file.name} is too large. Max size: ${mediaType === 'IMAGE' ? '30MB' : '500MB'
            }`
          );
          continue;
        }

        // Store file in temporary state
        // We'll upload it after campaign is created
        const tempFile: UploadedFile = {
          id: `temp-${Date.now()}-${Math.random()}`,
          url: URL.createObjectURL(file),
          fileName: file.name,
          fileSize: file.size,
          type: mediaType,
        };

        uploadedFiles.push(tempFile);

        // Store the actual File object for later upload (namespaced by session)
        setTempFile(tempFile.id, file);
        console.log(`[Wizard] DEBUG: Stored file in session ${wizardSessionId}: ${tempFile.id} (${file.name})`);
      }

      // Update platform with uploaded files
      setFormData((prev) => ({
        ...prev,
        platforms: prev.platforms.map((p, i) => {
          if (i !== platformIndex) return p;

          return {
            ...p,
            [mediaType === 'IMAGE' ? 'uploadedImages' : 'uploadedVideos']: [
              ...(mediaType === 'IMAGE'
                ? p.uploadedImages || []
                : p.uploadedVideos || []),
              ...uploadedFiles,
            ],
          };
        }),
      }));
    } catch (err: any) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Remove uploaded file from platform
   */
  const removeFile = (platformIndex: number, fileId: string, mediaType: 'IMAGE' | 'VIDEO') => {
    // Clean up temporary file (namespaced by session)
    const file = getTempFile(fileId);
    if (file) {
      deleteTempFile(fileId);
    }

    // Update platform
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p, i) => {
        if (i !== platformIndex) return p;

        return {
          ...p,
          [mediaType === 'IMAGE' ? 'uploadedImages' : 'uploadedVideos']: (
            mediaType === 'IMAGE' ? p.uploadedImages || [] : p.uploadedVideos || []
          ).filter((f) => f.id !== fileId),
        };
      }),
    }));
  };

  /**
   * Upload thumbnail for a specific video (Meta only)
   */
  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    platformIndex: number,
    videoId: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate it's an image
    if (!file.type.startsWith('image/')) {
      setError('Thumbnail must be an image file');
      return;
    }

    // Max 30MB for thumbnail
    if (file.size > 30 * 1024 * 1024) {
      setError('Thumbnail too large. Max size: 30MB');
      return;
    }

    // Create temp file for thumbnail
    const thumbnailId = `thumb-${Date.now()}-${Math.random()}`;
    const thumbnailUrl = URL.createObjectURL(file);

    // Store the actual File object for later upload (namespaced by session)
    setTempFile(thumbnailId, file);

    // Update the video with thumbnail info
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p, i) => {
        if (i !== platformIndex) return p;

        return {
          ...p,
          uploadedVideos: (p.uploadedVideos || []).map((vid) => {
            if (vid.id !== videoId) return vid;
            return {
              ...vid,
              thumbnailId,
              thumbnailUrl,
              thumbnailFileName: file.name,
            };
          }),
        };
      }),
    }));
  };

  /**
   * Remove thumbnail from a video
   */
  const removeThumbnail = (platformIndex: number, videoId: string, thumbnailId: string) => {
    // Clean up temporary file (namespaced by session)
    deleteTempFile(thumbnailId);

    // Update the video to remove thumbnail
    setFormData((prev) => ({
      ...prev,
      platforms: prev.platforms.map((p, i) => {
        if (i !== platformIndex) return p;

        return {
          ...p,
          uploadedVideos: (p.uploadedVideos || []).map((vid) => {
            if (vid.id !== videoId) return vid;
            return {
              ...vid,
              thumbnailId: undefined,
              thumbnailUrl: undefined,
              thumbnailFileName: undefined,
            };
          }),
        };
      }),
    }));
  };

  // Helper para agregar logs
  const addLog = (message: string, status: LaunchLog['status'] = 'in_progress') => {
    const log: LaunchLog = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      status,
      timestamp: new Date(),
    };
    setLaunchLogs(prev => [...prev, log]);
    return log.id;
  };

  // Helper para actualizar el status de un log
  const updateLogStatus = (logId: string, status: LaunchLog['status']) => {
    setLaunchLogs(prev => prev.map(log =>
      log.id === logId ? { ...log, status } : log
    ));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setIsLaunching(true);
    setLaunchLogs([]);
    setLaunchComplete(false);
    setLaunchSuccess(false);

    try {
      // STEP 1: Create campaign (async mode - returns immediately)
      const logId1 = addLog('Creando campaña...');

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!data.success) {
        updateLogStatus(logId1, 'error');
        addLog(`Error: ${data.error || 'Error creating campaign'}`, 'error');
        setLaunchComplete(true);
        setLaunchSuccess(false);
        return;
      }

      updateLogStatus(logId1, 'success');
      const campaignId = data.data.campaignId;
      const campaignStatus = data.data.status;
      setLaunchedCampaignId(campaignId);

      // Show status message
      if (campaignStatus === 'PENDING_ARTICLE') {
        addLog('Esperando aprobación de artículo en Tonic...', 'success');
        addLog('El sistema verificará automáticamente cada minuto.', 'success');
      } else if (campaignStatus === 'ARTICLE_APPROVED') {
        addLog('Campaña lista para procesar.', 'success');
        addLog('El sistema la procesará automáticamente en unos minutos.', 'success');
      }

      // STEP 2: Upload manual files (if any) - uses namespaced temp files to prevent race conditions
      const fileIds = getAllTempFileIds();

      // DEBUG: Log what's in the temp files storage
      console.log(`[Wizard] DEBUG: Session ID = ${wizardSessionId}`);
      console.log(`[Wizard] DEBUG: window.__tempFiles =`, JSON.stringify(Object.keys((window as any).__tempFiles || {})));
      console.log(`[Wizard] DEBUG: fileIds from namespace =`, fileIds);
      console.log(`[Wizard] DEBUG: formData.platforms =`, formData.platforms.map(p => ({
        platform: p.platform,
        images: p.uploadedImages?.length || 0,
        videos: p.uploadedVideos?.length || 0,
        imageIds: p.uploadedImages?.map(i => i.id),
        videoIds: p.uploadedVideos?.map(v => v.id),
      })));

      if (fileIds.length > 0) {
        console.log(`[Wizard] Uploading ${fileIds.length} manual files to campaign ${campaignId} (session: ${wizardSessionId})...`);

        // Track uploaded media IDs for linking thumbnails to videos
        const uploadedMediaMap: Record<string, string> = {}; // tempFileId -> serverMediaId

        // First pass: Upload all files (images and videos)
        for (const fileId of fileIds) {
          const file = getTempFile(fileId);
          if (!file) continue;

          // Skip thumbnails in first pass - they start with 'thumb-'
          if (fileId.startsWith('thumb-')) continue;

          // Determine media type from file
          const isVideo = file.type.startsWith('video/');
          const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

          // Find which platform this file belongs to
          const platform = formData.platforms.find(p =>
            (p.uploadedImages?.some(img => img.id === fileId)) ||
            (p.uploadedVideos?.some(vid => vid.id === fileId))
          );

          // Create FormData for upload
          const uploadFormData = new FormData();
          uploadFormData.append('file', file);
          uploadFormData.append('type', mediaType);
          if (platform) {
            uploadFormData.append('platform', platform.platform);
          }

          try {
            const uploadRes = await fetch(`/api/campaigns/${campaignId}/media`, {
              method: 'POST',
              body: uploadFormData,
            });

            const uploadData = await uploadRes.json();

            if (!uploadData.success) {
              console.error(`[Wizard] Failed to upload ${file.name}:`, uploadData.error);
              setError(`Failed to upload ${file.name}: ${uploadData.error}`);
              return;
            }

            // Store the mapping for linking thumbnails later
            uploadedMediaMap[fileId] = uploadData.data?.mediaId || uploadData.data?.id;
            console.log(`[Wizard] ✅ Uploaded ${file.name} successfully (ID: ${uploadedMediaMap[fileId]})`);
          } catch (uploadErr: any) {
            console.error(`[Wizard] Error uploading ${file.name}:`, uploadErr.message);
            setError(`Error uploading ${file.name}: ${uploadErr.message}`);
            return;
          }
        }

        // Second pass: Upload thumbnails and link to their videos
        for (const fileId of fileIds) {
          if (!fileId.startsWith('thumb-')) continue;

          const thumbnailFile = getTempFile(fileId);
          if (!thumbnailFile) continue;

          // Find the video this thumbnail belongs to
          let videoInfo: { videoTempId: string; platform: string } | null = null;
          for (const platform of formData.platforms) {
            const video = platform.uploadedVideos?.find(vid => vid.thumbnailId === fileId);
            if (video) {
              videoInfo = { videoTempId: video.id, platform: platform.platform };
              break;
            }
          }

          if (!videoInfo) {
            console.warn(`[Wizard] Thumbnail ${fileId} has no associated video, skipping`);
            continue;
          }

          const videoServerId = uploadedMediaMap[videoInfo.videoTempId];
          if (!videoServerId) {
            console.warn(`[Wizard] Video ${videoInfo.videoTempId} not uploaded yet, skipping thumbnail`);
            continue;
          }

          // Upload thumbnail with video ID link
          const uploadFormData = new FormData();
          uploadFormData.append('file', thumbnailFile);
          uploadFormData.append('type', 'IMAGE');
          uploadFormData.append('platform', videoInfo.platform);
          uploadFormData.append('linkedVideoId', videoServerId);

          try {
            const uploadRes = await fetch(`/api/campaigns/${campaignId}/media`, {
              method: 'POST',
              body: uploadFormData,
            });

            const uploadData = await uploadRes.json();

            if (!uploadData.success) {
              console.error(`[Wizard] Failed to upload thumbnail:`, uploadData.error);
              // Don't fail the whole operation for thumbnail failure
            } else {
              console.log(`[Wizard] ✅ Uploaded thumbnail for video ${videoServerId}`);
            }
          } catch (uploadErr: any) {
            console.error(`[Wizard] Error uploading thumbnail:`, uploadErr.message);
            // Don't fail the whole operation for thumbnail failure
          }
        }

        // Clean up temp files for this session only
        clearTempFilesNamespace();

        console.log(`[Wizard] ✅ All ${fileIds.length} files uploaded successfully (session: ${wizardSessionId})`);
        addLog('Archivos subidos correctamente.', 'success');
      }

      // Campaign created successfully (async mode - no launch step needed)
      // The cron jobs will handle article approval and platform launch automatically
      addLog('¡Campaña creada exitosamente!', 'success');
      addLog('Puedes ver el progreso en la lista de campañas.', 'success');

      setLaunchComplete(true);
      setLaunchSuccess(true);

    } catch (err: any) {
      addLog(`Error inesperado: ${err.message}`, 'error');
      setLaunchComplete(true);
      setLaunchSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🚀 Launch New Campaign
          </h1>
          <p className="text-gray-600">
            Create campaigns across Tonic, Meta, and TikTok with AI-powered content
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${step >= s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                    }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${step > s ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <span>Partner Settings</span>
            <span>Campaign Settings</span>
            <span>Review & Launch</span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white shadow-lg rounded-lg p-8">
          {/* Step 1: Partner Settings */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Step 1: Partner Settings
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Car Loans Summer Campaign"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Type *
                </label>
                <select
                  value={formData.campaignType}
                  onChange={(e) =>
                    handleInputChange('campaignType', e.target.value)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="CBO">CBO (Campaign Budget Optimization)</option>
                  <option value="ABO">ABO (Ad Set Budget Optimization)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Account (Tonic) *
                </label>
                <select
                  value={formData.tonicAccountId}
                  onChange={(e) => handleInputChange('tonicAccountId', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a Tonic account...</option>
                  {tonicAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Offer *
                </label>
                <select
                  value={formData.offerId}
                  onChange={(e) => handleInputChange('offerId', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select an offer...</option>
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name} {offer.vertical && `(${offer.vertical})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country *
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => handleInputChange('country', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.offerId}
                  required
                >
                  <option value="">Select a country...</option>
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Language *
                </label>
                <select
                  value={formData.language}
                  onChange={(e) => handleInputChange('language', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="pt">Português</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Copy Master (Optional)
                  <span className="text-xs text-gray-500 ml-2">
                    Leave empty to generate with AI
                  </span>
                </label>
                <textarea
                  value={formData.copyMaster}
                  onChange={(e) => handleInputChange('copyMaster', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="e.g., Get approved for your dream car with low interest rates..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Communication Angle (Optional)
                </label>
                <input
                  type="text"
                  value={formData.communicationAngle}
                  onChange={(e) =>
                    handleInputChange('communicationAngle', e.target.value)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Urgency, Trust, Value"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Keywords (Optional)
                  <span className="text-xs text-gray-500 ml-2">
                    Leave empty to generate with AI
                  </span>
                </label>
                <textarea
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  onBlur={() => {
                    const keywordsArray = keywordsText
                      ? keywordsText.split(',').map(k => k.trim()).filter(k => k)
                      : [];
                    handleInputChange('keywords', keywordsArray);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="e.g., car loans, auto financing, vehicle payment plans..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate keywords with commas. AI will generate 6-10 keywords if left empty.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content Generation Phrases (Optional)
                  <span className="text-xs text-gray-500 ml-2">
                    Leave empty to generate with AI (3-5 phrases required if filled)
                  </span>
                </label>
                <textarea
                  value={contentPhrasesText}
                  onChange={(e) => setContentPhrasesText(e.target.value)}
                  onBlur={() => {
                    const phrasesArray = contentPhrasesText
                      ? contentPhrasesText.split(',').map(p => p.trim()).filter(p => p)
                      : [];
                    handleInputChange('contentGenerationPhrases', phrasesArray);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="e.g., best car loan rates, quick approval process, flexible payment options..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate phrases with commas. AI will generate 3-5 phrases if left empty. These are used by Tonic for RSOC article generation.
                </p>
                {formData.contentGenerationPhrases.length > 0 &&
                 (formData.contentGenerationPhrases.length < 3 || formData.contentGenerationPhrases.length > 5) && (
                  <p className="text-xs text-red-600 mt-1 font-medium">
                    Must have between 3 and 5 phrases. Currently: {formData.contentGenerationPhrases.length}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Campaign Settings */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Step 2: Campaign Settings
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Platforms *
                </label>
                <div className="flex gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => addPlatform('META')}
                    disabled={formData.platforms.some((p) => p.platform === 'META')}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    + Add Meta (FB/IG)
                  </button>
                  <button
                    type="button"
                    onClick={() => addPlatform('TIKTOK')}
                    disabled={formData.platforms.some((p) => p.platform === 'TIKTOK')}
                    className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    + Add TikTok
                  </button>
                </div>
              </div>

              {formData.platforms.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No platforms selected. Add Meta or TikTok to continue.
                </div>
              )}

              {formData.platforms.map((platform, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-6 relative"
                >
                  <button
                    type="button"
                    onClick={() => removePlatform(index)}
                    className="absolute top-4 right-4 text-red-600 hover:text-red-800"
                  >
                    ✕ Remove
                  </button>

                  <h3 className="text-lg font-semibold mb-4">
                    {platform.platform === 'META'
                      ? '📘 Meta (Facebook/Instagram)'
                      : '🎵 TikTok'}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {platform.platform === 'META' ? 'Meta Ad Account *' : 'TikTok Advertiser *'}
                      </label>
                      <select
                        value={platform.accountId || ''}
                        onChange={(e) => {
                          const accountId = e.target.value;
                          updatePlatform(index, 'accountId', accountId);
                          // Clear and reload Fan Pages or Identities when account changes
                          if (platform.platform === 'META') {
                            updatePlatform(index, 'metaPageId', '');
                            loadMetaPages(accountId);
                          } else if (platform.platform === 'TIKTOK') {
                            updatePlatform(index, 'tiktokIdentityId', '');
                            updatePlatform(index, 'tiktokIdentityType', '');
                            loadTiktokIdentities(accountId);
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">
                          {`Select ${platform.platform === 'META' ? 'Meta account' : 'TikTok advertiser'}...`}
                        </option>
                        {platform.platform === 'META' &&
                          metaAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                              {account.metaPortfolio && ` - ${account.metaPortfolio}`}
                            </option>
                          ))}
                        {platform.platform === 'TIKTOK' &&
                          tiktokAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Fan Page Selector for Meta */}
                    {platform.platform === 'META' && platform.accountId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Facebook Fan Page *
                        </label>
                        {loadingMetaPages ? (
                          <div className="text-sm text-gray-500 py-2">Loading Fan Pages...</div>
                        ) : (
                          <select
                            value={platform.metaPageId || ''}
                            onChange={(e) => updatePlatform(index, 'metaPageId', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select a Fan Page...</option>
                            {metaPages.map((page) => (
                              <option key={page.id} value={page.id}>
                                {page.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          The Facebook Page to use for Instagram placements.
                        </p>
                      </div>
                    )}

                    {/* Identity Selector for TikTok */}
                    {platform.platform === 'TIKTOK' && platform.accountId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          TikTok Identity *
                        </label>
                        {loadingTiktokIdentities ? (
                          <div className="text-sm text-gray-500 py-2">Loading Identities...</div>
                        ) : (
                          <select
                            value={platform.tiktokIdentityId || ''}
                            onChange={(e) => {
                              const selectedIdentity = tiktokIdentities.find(i => i.id === e.target.value);
                              updatePlatform(index, 'tiktokIdentityId', e.target.value);
                              updatePlatform(index, 'tiktokIdentityType', selectedIdentity?.type || 'CUSTOMIZED_USER');
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                          >
                            <option value="">Select an Identity...</option>
                            {tiktokIdentities.map((identity) => (
                              <option key={identity.id} value={identity.id}>
                                {identity.name} ({identity.type})
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          The TikTok account to display in ads.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Performance Goal
                      </label>
                      <select
                        value={platform.performanceGoal}
                        onChange={(e) =>
                          updatePlatform(index, 'performanceGoal', e.target.value)
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Lead Generation">Lead Generation</option>
                        <option value="Traffic">Traffic</option>
                        <option value="Conversions">Conversions</option>
                        <option value="Engagement">Engagement</option>
                      </select>
                    </div>

                    {platform.platform === 'META' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Special Ad Categories
                        </label>
                        <select
                          multiple
                          value={platform.specialAdCategories || []}
                          onChange={(e) => {
                            const options = Array.from(e.target.selectedOptions, option => option.value);
                            updatePlatform(index, 'specialAdCategories', options);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-32"
                        >
                          <option value="NONE">NONE</option>
                          <option value="HOUSING">HOUSING</option>
                          <option value="CREDIT">CREDIT</option>
                          <option value="EMPLOYMENT">EMPLOYMENT</option>
                          <option value="ISSUES_ELECTIONS_POLITICS">ISSUES_ELECTIONS_POLITICS</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Hold Ctrl (Windows) or Cmd (Mac) to select multiple options. Select NONE if no categories apply.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Daily Budget (USD)
                      </label>
                      <input
                        type="number"
                        value={platform.budget}
                        onChange={(e) =>
                          updatePlatform(index, 'budget', e.target.value)
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        min="1"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date & Time (UTC)
                      </label>
                      <input
                        type="datetime-local"
                        value={platform.startDateTime}
                        onChange={(e) =>
                          updatePlatform(index, 'startDateTime', e.target.value)
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Schedule when the campaign should start. Time is in UTC.
                      </p>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`ai-${index}`}
                        checked={platform.generateWithAI}
                        onChange={(e) =>
                          updatePlatform(index, 'generateWithAI', e.target.checked)
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label
                        htmlFor={`ai-${index}`}
                        className="ml-2 text-sm text-gray-700"
                      >
                        🤖 Generate images and videos with AI
                      </label>
                    </div>

                    {/* Manual Ad Copy Fields - Only for Meta */}
                    {platform.platform === 'META' && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-blue-900 mb-3">
                          Ad Copy (Optional)
                        </h4>
                        <p className="text-xs text-blue-700 mb-4">
                          Leave empty to generate with AI. If you fill any field, empty fields will remain empty.
                        </p>

                        <div className="space-y-4">
                          {/* Ad Title / Headline */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Ad Title (Headline)
                            </label>
                            <input
                              type="text"
                              value={platform.manualAdTitle || ''}
                              onChange={(e) => updatePlatform(index, 'manualAdTitle', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              placeholder="Max 40 characters..."
                              maxLength={40}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {(platform.manualAdTitle || '').length}/40 characters
                            </p>
                          </div>

                          {/* Primary Text */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Primary Text
                            </label>
                            <textarea
                              value={platform.manualPrimaryText || ''}
                              onChange={(e) => updatePlatform(index, 'manualPrimaryText', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              rows={2}
                              placeholder="Max 125 characters..."
                              maxLength={125}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {(platform.manualPrimaryText || '').length}/125 characters
                            </p>
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Description
                            </label>
                            <input
                              type="text"
                              value={platform.manualDescription || ''}
                              onChange={(e) => updatePlatform(index, 'manualDescription', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                              placeholder="Max 30 characters..."
                              maxLength={30}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {(platform.manualDescription || '').length}/30 characters. Note: Description is ignored by Meta API when using video ads.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Manual Ad Copy Fields - Only for TikTok */}
                    {platform.platform === 'TIKTOK' && (
                      <div className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-pink-900 mb-3">
                          Ad Text (Optional)
                        </h4>
                        <p className="text-xs text-pink-700 mb-4">
                          Leave empty to generate with AI. This is the main text shown on your TikTok ad.
                        </p>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Ad Text (Title)
                          </label>
                          <textarea
                            value={platform.manualTiktokAdText || ''}
                            onChange={(e) => updatePlatform(index, 'manualTiktokAdText', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                            rows={2}
                            placeholder="Max 100 characters..."
                            maxLength={100}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {(platform.manualTiktokAdText || '').length}/100 characters
                          </p>
                        </div>
                      </div>
                    )}

                    {/* MANUAL UPLOAD SECTION - Only shown when AI is disabled */}
                    {!platform.generateWithAI && (
                      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-yellow-900 mb-3">
                          📤 Manual Upload Mode
                        </h4>
                        <p className="text-xs text-yellow-700 mb-4">
                          Upload your own images and videos. Files will be validated according to{' '}
                          {platform.platform} requirements.
                        </p>

                        {/* Image Upload */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Images (JPG, PNG)
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            {platform.platform === 'META'
                              ? 'Recommended: 1:1 square. Max 30MB'
                              : 'Recommended: 9:16 vertical. Max 500KB'}
                          </p>
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            multiple
                            onChange={(e) => handleFileUpload(e, index, 'IMAGE')}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          {platform.uploadedImages && platform.uploadedImages.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {platform.uploadedImages.map((img) => (
                                <div
                                  key={img.id}
                                  className="flex items-center justify-between text-xs bg-green-50 p-2 rounded"
                                >
                                  <span className="text-green-700">
                                    ✓ {img.fileName} ({(img.fileSize / 1024).toFixed(0)}KB)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeFile(index, img.id, 'IMAGE')}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Video Upload */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Videos (MP4, MOV)
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            {platform.platform === 'META'
                              ? 'Recommended: 1:1 or 9:16. Max 4GB, 1-241min'
                              : 'Recommended: 9:16. Max 500MB, 5-60sec'}
                          </p>
                          <input
                            type="file"
                            accept="video/mp4,video/quicktime,video/mpeg,video/avi"
                            multiple
                            onChange={(e) => handleFileUpload(e, index, 'VIDEO')}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          {platform.uploadedVideos && platform.uploadedVideos.length > 0 && (
                            <div className="mt-2 space-y-3">
                              {platform.uploadedVideos.map((vid) => (
                                <div
                                  key={vid.id}
                                  className="p-3 border border-green-200 rounded-lg bg-green-50"
                                >
                                  {/* Video info row */}
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-green-700 font-medium">
                                      🎬 {vid.fileName} ({(vid.fileSize / 1024 / 1024).toFixed(2)}MB)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeFile(index, vid.id, 'VIDEO')}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {/* Thumbnail section (Meta only) */}
                                  {platform.platform === 'META' && (
                                    <div className="mt-2 pt-2 border-t border-green-200">
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Thumbnail Image (required for Meta)
                                      </label>
                                      {vid.thumbnailId ? (
                                        <div className="flex items-center justify-between text-xs bg-blue-50 p-2 rounded">
                                          <div className="flex items-center gap-2">
                                            {vid.thumbnailUrl && (
                                              <img
                                                src={vid.thumbnailUrl}
                                                alt="Thumbnail"
                                                className="w-8 h-8 object-cover rounded"
                                              />
                                            )}
                                            <span className="text-blue-700">
                                              ✓ {vid.thumbnailFileName}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => removeThumbnail(index, vid.id, vid.thumbnailId!)}
                                            className="text-red-600 hover:text-red-800"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ) : (
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => handleThumbnailUpload(e, index, vid.id)}
                                          className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {(!platform.uploadedImages || platform.uploadedImages.length === 0) &&
                          (!platform.uploadedVideos || platform.uploadedVideos.length === 0) && (
                            <div className="mt-3 text-xs text-yellow-700 font-medium">
                              ⚠️ Please upload at least one image or video to continue
                            </div>
                          )}

                        {/* Warning: Meta videos require thumbnails */}
                        {platform.platform === 'META' &&
                          platform.uploadedVideos &&
                          platform.uploadedVideos.length > 0 &&
                          platform.uploadedVideos.some((vid) => !vid.thumbnailId) && (
                            <div className="mt-3 text-xs text-orange-700 font-medium bg-orange-50 p-2 rounded">
                              ⚠️ Meta requires a thumbnail for each video. Please add thumbnails to continue.
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Review & Launch */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Step 3: Review & Launch
              </h2>

              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-700">Campaign Name</h3>
                  <p className="text-gray-900">{formData.name}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Type</h3>
                  <p className="text-gray-900">{formData.campaignType}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Add Account (Tonic)</h3>
                  <p className="text-gray-900">
                    {tonicAccounts.find((a) => a.id === formData.tonicAccountId)?.name}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Offer</h3>
                  <p className="text-gray-900">
                    {offers.find((o) => o.id === formData.offerId)?.name}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Country</h3>
                  <p className="text-gray-900">
                    {countries.find((c) => c.code === formData.country)?.name}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Language</h3>
                  <p className="text-gray-900">{formData.language.toUpperCase()}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700">Platforms</h3>
                  <ul className="list-disc list-inside text-gray-900">
                    {formData.platforms.map((p, i) => {
                      const account =
                        p.platform === 'META'
                          ? metaAccounts.find((a) => a.id === p.accountId)
                          : tiktokAccounts.find((a) => a.id === p.accountId);
                      return (
                        <li key={i}>
                          {p.platform} ({account?.name}) - ${p.budget}/day -{' '}
                          {p.performanceGoal}
                          {p.generateWithAI && ' (AI content enabled)'}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">
                    🤖 AI Will Generate:
                  </h3>
                  <ul className="list-disc list-inside text-blue-800 text-sm">
                    {!formData.copyMaster && <li>Copy Master</li>}
                    <li>Keywords (6-10)</li>
                    <li>RSOC Article</li>
                    <li>Platform-specific ad copy</li>
                    {formData.platforms.some((p) => p.generateWithAI) && (
                      <>
                        <li>Images (Imagen 4 Fast)</li>
                        <li>Videos (Veo 3.1 Fast)</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  ⚠️ <strong>Note:</strong> The campaign will be created in PAUSED
                  state. You can activate it after reviewing the generated content.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 &&
                    (!formData.name ||
                      !formData.tonicAccountId ||
                      !formData.offerId ||
                      !formData.country ||
                      // Validate content generation phrases: if filled, must be 3-5
                      (formData.contentGenerationPhrases.length > 0 &&
                        (formData.contentGenerationPhrases.length < 3 ||
                         formData.contentGenerationPhrases.length > 5)))) ||
                  (step === 2 &&
                    (formData.platforms.length === 0 ||
                      formData.platforms.some((p) => !p.accountId) ||
                      // Meta requires Fan Page selection
                      formData.platforms.some((p) =>
                        p.platform === 'META' && !p.metaPageId
                      ) ||
                      // TikTok requires Identity selection
                      formData.platforms.some((p) =>
                        p.platform === 'TIKTOK' && !p.tiktokIdentityId
                      ) ||
                      // Meta videos must have thumbnails
                      formData.platforms.some((p) =>
                        p.platform === 'META' &&
                        p.uploadedVideos &&
                        p.uploadedVideos.length > 0 &&
                        p.uploadedVideos.some((vid) => !vid.thumbnailId)
                      )))
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Launching...
                  </>
                ) : (
                  <>🚀 Launch Campaign</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de logs durante el lanzamiento */}
      {isLaunching && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className={`p-4 flex-shrink-0 ${launchComplete ? (launchSuccess ? 'bg-green-600' : 'bg-red-600') : 'bg-blue-600'} text-white`}>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {launchComplete ? (
                  launchSuccess ? (
                    <><span>🚀</span> ¡Campaña Enviada!</>
                  ) : (
                    <><span>❌</span> Error en el Lanzamiento</>
                  )
                ) : (
                  <><span className="animate-spin">⚙️</span> Preparando Campaña...</>
                )}
              </h3>
            </div>

            {/* Logs - scrollable, takes remaining space */}
            <div className="p-4 flex-1 overflow-y-auto min-h-0">
              <div className="space-y-2">
                {launchLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 p-2 rounded ${
                      log.status === 'error'
                        ? 'bg-red-50 text-red-800'
                        : log.status === 'success'
                          ? 'bg-green-50 text-green-800'
                          : 'bg-blue-50 text-blue-800'
                    }`}
                  >
                    <span className="flex-shrink-0">
                      {log.status === 'in_progress' && <span className="animate-spin inline-block">⏳</span>}
                      {log.status === 'success' && '✅'}
                      {log.status === 'error' && '❌'}
                      {log.status === 'pending' && '⏳'}
                    </span>
                    <span className="text-sm">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer con botones - SIEMPRE visible, nunca se oculta */}
            <div className="p-4 border-t bg-gray-50 flex-shrink-0">
              {launchComplete && launchSuccess && (
                <div className="text-center mb-4 p-3 bg-green-50 rounded-lg">
                  <p className="text-green-800 text-sm">
                    ¡Campaña lanzada exitosamente! Puedes ver el estado o lanzar otra campaña.
                  </p>
                </div>
              )}
              {launchComplete && !launchSuccess && (
                <div className="text-center mb-4 p-3 bg-red-50 rounded-lg">
                  <p className="text-red-800 text-sm">
                    Hubo errores durante el lanzamiento. Revisa los detalles arriba.
                  </p>
                </div>
              )}
              {!launchComplete && (
                <div className="text-center mb-4 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    Puedes lanzar otra campaña mientras esta se procesa. El lanzamiento puede tardar varios minutos.
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                {launchedCampaignId ? (
                  <button
                    onClick={() => {
                      setIsLaunching(false);
                      router.push(`/campaigns/${launchedCampaignId}`);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Ver Estado
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
                  >
                    Ver Estado (esperando ID...)
                  </button>
                )}
                <button
                  onClick={() => {
                    // Reset form for new campaign
                    setIsLaunching(false);
                    setLaunchLogs([]);
                    setLaunchComplete(false);
                    setLaunchSuccess(false);
                    setLaunchedCampaignId(null);
                    setStep(1);
                    setFormData({
                      name: '',
                      campaignType: 'CBO',
                      tonicAccountId: '',
                      offerId: '',
                      country: '',
                      language: 'en',
                      copyMaster: '',
                      communicationAngle: '',
                      keywords: [],
                      contentGenerationPhrases: [],
                      platforms: [],
                    });
                    setKeywordsText('');
                    setContentPhrasesText('');
                    setError(null);
                    // Generate new session ID for next campaign (prevents race conditions)
                    setWizardSessionId(`wizard-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Lanzar Otra Campaña
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
