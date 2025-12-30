'use client';

import { useState, useEffect, useRef } from 'react';
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
  category?: string; // Tonic API may use 'category' instead of 'vertical'
  niche?: string;    // Or 'niche' in some cases
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
  aiMediaType?: 'IMAGE' | 'VIDEO' | 'BOTH';  // What type of media to generate with AI
  aiMediaCount?: number;  // How many images/videos to generate (1-5)
  adsPerAdSet?: number;  // For ABO: How many ads to put in each ad set (1-5)
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

interface CampaignWizardProps {
  cloneFromId?: string;
}

export default function CampaignWizard({ cloneFromId }: CampaignWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingClone, setLoadingClone] = useState(!!cloneFromId);

  // Unique session ID to namespace temp files (prevents race conditions when creating multiple campaigns)
  // Using useRef to ensure the ID never changes during the component's lifecycle
  const wizardSessionIdRef = useRef(`wizard-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
  const wizardSessionId = wizardSessionIdRef.current;

  // Estado para logs inline durante el lanzamiento
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchLogs, setLaunchLogs] = useState<LaunchLog[]>([]);
  const [launchComplete, setLaunchComplete] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [launchedCampaignId, setLaunchedCampaignId] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ message: string; details?: string; suggestion?: string; tonicData?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  // Content phrases validation state
  const [phrasesValidation, setPhrasesValidation] = useState<{
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    message?: string;
    errors?: string[];
  }>({ status: 'idle' });

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

  // Copy Master suggestions state
  const [copySuggestions, setCopySuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  // Keywords suggestions state
  const [keywordSuggestions, setKeywordSuggestions] = useState<{ keyword: string; type: string }[]>([]);
  const [loadingKeywords, setLoadingKeywords] = useState(false);
  const [keywordsError, setKeywordsError] = useState<string | null>(null);

  // Ad Copy suggestions state (Phase 2 - Meta) - Sequential: Title -> Primary Text -> Description
  // Step 1: Ad Title suggestions (max 80 chars)
  const [adTitleSuggestions, setAdTitleSuggestions] = useState<string[]>([]);
  const [loadingAdTitles, setLoadingAdTitles] = useState(false);
  const [adTitleError, setAdTitleError] = useState<string | null>(null);

  // Step 2: Primary Text suggestions (max 120 chars) - requires selected title
  const [adPrimaryTextSuggestions, setAdPrimaryTextSuggestions] = useState<string[]>([]);
  const [loadingAdPrimaryText, setLoadingAdPrimaryText] = useState(false);
  const [adPrimaryTextError, setAdPrimaryTextError] = useState<string | null>(null);

  // Step 3: Description suggestions (max 120 chars) - requires selected title + primary text
  const [adDescriptionSuggestions, setAdDescriptionSuggestions] = useState<string[]>([]);
  const [loadingAdDescription, setLoadingAdDescription] = useState(false);
  const [adDescriptionError, setAdDescriptionError] = useState<string | null>(null);

  // Legacy: Keep for TikTok (which still uses the old flow)
  const [tiktokAdCopySuggestions, setTiktokAdCopySuggestions] = useState<{ adText: string }[]>([]);
  const [loadingTiktokAdCopy, setLoadingTiktokAdCopy] = useState(false);
  const [tiktokAdCopyError, setTiktokAdCopyError] = useState<string | null>(null);

  // AI Generated Images state (per platform index)
  const [generatedImages, setGeneratedImages] = useState<Record<number, { url: string; gcsPath: string; prompt: string }[]>>({});
  const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({});
  const [generateImagesError, setGenerateImagesError] = useState<Record<number, string | null>>({});

  // Constants
  const MAX_KEYWORDS = 10;

  // Helper: Check if selected Tonic account is "Meta" type
  const isTonicMetaSelected = (): boolean => {
    if (!formData.tonicAccountId) return false;
    const selectedAccount = tonicAccounts.find(a => a.id === formData.tonicAccountId);
    return selectedAccount?.name?.toLowerCase().includes('meta') ?? false;
  };

  // Helper: Get current keyword count
  const getCurrentKeywordCount = (): number => {
    if (!keywordsText.trim()) return 0;
    return keywordsText.split(',').map(k => k.trim()).filter(k => k).length;
  };

  // Helper: Check if keyword limit is reached
  const isKeywordLimitReached = (): boolean => {
    return getCurrentKeywordCount() >= MAX_KEYWORDS;
  };

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
      // Spanish-speaking countries
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
      'PA': 'es', // Panama
      'UY': 'es', // Uruguay
      'PY': 'es', // Paraguay
      'BO': 'es', // Bolivia
      'DO': 'es', // Dominican Republic
      'HN': 'es', // Honduras
      'SV': 'es', // El Salvador
      'NI': 'es', // Nicaragua
      // English-speaking countries
      'US': 'en', // United States
      'GB': 'en', // United Kingdom
      'CA': 'en', // Canada
      'AU': 'en', // Australia
      'NZ': 'en', // New Zealand
      'IE': 'en', // Ireland
      'ZA': 'en', // South Africa
      'SG': 'en', // Singapore (English is official)
      'PH': 'en', // Philippines
      // German-speaking countries
      'DE': 'de', // Germany
      'AT': 'de', // Austria
      'CH': 'de', // Switzerland
      // French-speaking countries
      'FR': 'fr', // France
      'BE': 'fr', // Belgium
      // Portuguese-speaking countries
      'BR': 'pt', // Brazil
      'PT': 'pt', // Portugal
      // Italian
      'IT': 'it', // Italy
      // Dutch
      'NL': 'nl', // Netherlands
      // Polish
      'PL': 'pl', // Poland
      // Russian
      'RU': 'ru', // Russia
      // Japanese
      'JP': 'ja', // Japan
      // Korean
      'KR': 'ko', // South Korea
      // Chinese
      'CN': 'zh', // China
      'TW': 'zh', // Taiwan
      'HK': 'zh', // Hong Kong
      // Arabic-speaking countries
      'SA': 'ar', // Saudi Arabia
      'AE': 'ar', // UAE
      'EG': 'ar', // Egypt
      'MA': 'ar', // Morocco
      'DZ': 'ar', // Algeria
      'KW': 'ar', // Kuwait
      'QA': 'ar', // Qatar
      'BH': 'ar', // Bahrain
      'OM': 'ar', // Oman
      'JO': 'ar', // Jordan
      'LB': 'ar', // Lebanon
      // Hindi
      'IN': 'hi', // India
      // Thai
      'TH': 'th', // Thailand
      // Vietnamese
      'VN': 'vi', // Vietnam
      // Indonesian/Malay
      'ID': 'id', // Indonesia
      'MY': 'ms', // Malaysia
      // Turkish
      'TR': 'tr', // Turkey
      // Scandinavian
      'SE': 'sv', // Sweden
      'DK': 'da', // Denmark
      'FI': 'fi', // Finland
      'NO': 'no', // Norway
      // Greek
      'GR': 'el', // Greece
      // Hebrew
      'IL': 'he', // Israel
      // Central/Eastern European
      'CZ': 'cs', // Czech Republic
      'HU': 'hu', // Hungary
      'RO': 'ro', // Romania
    };

    const defaultLang = countryLanguageMap[formData.country];
    if (defaultLang) {
      handleInputChange('language', defaultLang);
    }
  }, [formData.country]);

  // Load campaign data when cloning
  useEffect(() => {
    if (!cloneFromId) return;

    const loadCampaignToClone = async () => {
      try {
        setLoadingClone(true);
        const res = await fetch(`/api/campaigns/${cloneFromId}`);
        const data = await res.json();

        if (!data.success || !data.data) {
          console.error('Failed to load campaign for cloning');
          setLoadingClone(false);
          return;
        }

        const campaign = data.data;

        // Find the Tonic account that was used
        const tonicAccountMatch = tonicAccounts.find(acc =>
          acc.id === campaign.tonicAccountId
        );

        // Build platforms config from campaign platforms
        // Default to tomorrow at 1:00 AM UTC
        const tomorrowUTC = new Date();
        tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
        tomorrowUTC.setUTCHours(1, 0, 0, 0);
        const defaultStartDateTime = tomorrowUTC.toISOString().slice(0, 16);

        // Convert campaign media to UploadedFile format for cloning
        const clonedImages: UploadedFile[] = campaign.media
          ?.filter((m: any) => m.type === 'IMAGE')
          .map((m: any) => ({
            id: `clone-${m.id}`,
            url: m.url,
            fileName: m.filename || 'image.jpg',
            fileSize: 0, // Unknown from clone
            type: 'IMAGE' as const,
          })) || [];

        const clonedVideos: UploadedFile[] = campaign.media
          ?.filter((m: any) => m.type === 'VIDEO')
          .map((m: any) => ({
            id: `clone-${m.id}`,
            url: m.url,
            fileName: m.filename || 'video.mp4',
            fileSize: 0, // Unknown from clone
            type: 'VIDEO' as const,
            thumbnailId: m.thumbnailUrl ? `clone-thumb-${m.id}` : undefined,
            thumbnailUrl: m.thumbnailUrl,
            thumbnailFileName: m.thumbnailUrl ? 'thumbnail.jpg' : undefined,
          })) || [];

        const platformsConfig: PlatformConfig[] = campaign.platforms?.map((p: any) => ({
          platform: p.platform as 'META' | 'TIKTOK',
          accountId: p.platform === 'META' ? p.metaAccountId : p.tiktokAccountId,
          performanceGoal: p.performanceGoal || 'leads',
          budget: p.budget?.toString() || '50',
          startDateTime: defaultStartDateTime, // Tomorrow 1:00 AM UTC
          generateWithAI: true,
          specialAdCategories: p.specialAdCategories || [],
          manualAdTitle: p.manualAdTitle || '',
          manualDescription: p.manualDescription || '',
          manualPrimaryText: p.manualPrimaryText || '',
          manualTiktokAdText: p.manualTiktokAdText || '',
          metaPageId: p.metaPageId || '',
          tiktokIdentityId: p.tiktokIdentityId || '',
          tiktokIdentityType: p.tiktokIdentityType || '',
          // Include cloned media for all platforms
          uploadedImages: clonedImages,
          uploadedVideos: clonedVideos,
        })) || [];

        // Update form data with campaign data
        setFormData({
          name: `${campaign.name} - Copia`,
          campaignType: campaign.campaignType || 'CBO',
          tonicAccountId: campaign.tonicAccountId || tonicAccountMatch?.id || '',
          offerId: campaign.offer?.tonicId || '',
          country: campaign.country || '',
          language: campaign.language || 'en',
          copyMaster: campaign.copyMaster || '',
          communicationAngle: campaign.communicationAngle || '',
          keywords: campaign.keywords || [],
          contentGenerationPhrases: campaign.contentGenerationPhrases || [],
          platforms: platformsConfig,
        });

        // Update text inputs for keywords
        if (campaign.keywords && campaign.keywords.length > 0) {
          setKeywordsText(campaign.keywords.join(', '));
        }

        // Update content phrases
        if (campaign.contentGenerationPhrases && campaign.contentGenerationPhrases.length > 0) {
          setContentPhrasesText(campaign.contentGenerationPhrases.join('\n'));
        }

        setLoadingClone(false);
      } catch (err) {
        console.error('Error loading campaign to clone:', err);
        setLoadingClone(false);
      }
    };

    // Wait for all accounts to load first (tonic, meta, and tiktok)
    // This ensures the cloned platform accounts can be properly matched
    const hasTonicAccounts = tonicAccounts.length > 0;
    const hasMetaAccounts = metaAccounts.length > 0;
    const hasTiktokAccounts = tiktokAccounts.length > 0;

    if (hasTonicAccounts && hasMetaAccounts && hasTiktokAccounts) {
      loadCampaignToClone();
    }
  }, [cloneFromId, tonicAccounts, metaAccounts, tiktokAccounts]);

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

  // Load Meta Pages and TikTok Identities when cloning completes
  // This runs after loadingClone becomes false and platforms have accountIds
  useEffect(() => {
    // Only run when clone just finished (loadingClone went from true to false)
    // and we have cloneFromId (meaning this is a clone operation)
    if (cloneFromId && !loadingClone && formData.platforms.length > 0) {
      formData.platforms.forEach((platform) => {
        if (platform.accountId) {
          if (platform.platform === 'META') {
            loadMetaPages(platform.accountId);
          } else if (platform.platform === 'TIKTOK') {
            loadTiktokIdentities(platform.accountId);
          }
        }
      });
    }
  }, [cloneFromId, loadingClone, formData.platforms.length]);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /**
   * Generate 5 Copy Master suggestions using AI (CopyBot 7.1)
   */
  const generateCopySuggestions = async () => {
    if (!formData.offerId || !formData.country || !formData.language) {
      setSuggestionsError('Selecciona primero una Oferta, País e Idioma');
      return;
    }

    setLoadingSuggestions(true);
    setSuggestionsError(null);
    setCopySuggestions([]);

    try {
      // Get selected offer from local array (offers come from Tonic API, not local DB)
      const selectedOffer = offers.find(o => o.id === formData.offerId);

      const response = await fetch('/api/ai/copy-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerName: selectedOffer?.name || '',
          offerVertical: selectedOffer?.vertical || selectedOffer?.category || selectedOffer?.niche || '',
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate suggestions');
      }

      setCopySuggestions(result.data.suggestions);
    } catch (error: any) {
      setSuggestionsError(error.message);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  /**
   * Select a Copy Master suggestion and fill the textarea
   */
  const selectCopySuggestion = (suggestion: string) => {
    handleInputChange('copyMaster', suggestion);
    setCopySuggestions([]); // Hide suggestions after selecting
  };

  /**
   * Generate 10 keyword suggestions using AI (SEO Specialist methodology)
   */
  const generateKeywordsSuggestions = async () => {
    if (!formData.offerId || !formData.country || !formData.language) {
      setKeywordsError('Select Offer, Country, and Language first');
      return;
    }

    setLoadingKeywords(true);
    setKeywordsError(null);
    setKeywordSuggestions([]);

    try {
      const selectedOffer = offers.find(o => o.id === formData.offerId);
      const category = selectedOffer?.vertical || selectedOffer?.category || selectedOffer?.niche || selectedOffer?.name || '';

      const response = await fetch('/api/ai/keyword-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate suggestions');
      }

      setKeywordSuggestions(result.data.suggestions);
    } catch (error: any) {
      setKeywordsError(error.message);
    } finally {
      setLoadingKeywords(false);
    }
  };

  /**
   * Add a keyword suggestion to the keywords field (accumulates, doesn't replace)
   * Respects the MAX_KEYWORDS limit
   */
  const addKeywordSuggestion = (keyword: string) => {
    // Check if limit is reached
    if (isKeywordLimitReached()) return;

    const currentKeywords = keywordsText.trim();
    if (currentKeywords) {
      // Check if already exists
      const existing = currentKeywords.split(',').map(k => k.trim().toLowerCase());
      if (!existing.includes(keyword.toLowerCase())) {
        const newKeywords = `${currentKeywords}, ${keyword}`;
        setKeywordsText(newKeywords);
        handleInputChange('keywords', newKeywords.split(',').map(k => k.trim()).filter(Boolean));
      }
    } else {
      setKeywordsText(keyword);
      handleInputChange('keywords', [keyword]);
    }
  };

  /**
   * Step 1: Generate Ad Title suggestions (max 80 chars)
   */
  const generateAdTitleSuggestions = async (platformIndex: number) => {
    if (!formData.offerId || !formData.copyMaster || !formData.country || !formData.language) {
      setAdTitleError('Complete Phase 1 first (Offer, Copy Master, Country, Language)');
      return;
    }

    setLoadingAdTitles(true);
    setAdTitleError(null);
    setAdTitleSuggestions([]);

    try {
      const selectedOffer = offers.find(o => o.id === formData.offerId);

      const response = await fetch('/api/ai/ad-copy-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'title',
          offerName: selectedOffer?.name || '',
          copyMaster: formData.copyMaster,
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate title suggestions');
      }

      setAdTitleSuggestions(result.data.titles || []);
    } catch (error: any) {
      setAdTitleError(error.message);
    } finally {
      setLoadingAdTitles(false);
    }
  };

  /**
   * Select an Ad Title suggestion (keeps suggestions visible like Copy Master)
   */
  const selectAdTitleSuggestion = (platformIndex: number, title: string) => {
    updatePlatform(platformIndex, 'manualAdTitle', title);
    // Clear dependent suggestions when title changes (user needs to regenerate)
    setAdPrimaryTextSuggestions([]);
    setAdDescriptionSuggestions([]);
  };

  /**
   * Step 2: Generate Primary Text suggestions (max 120 chars)
   * Requires: selected Ad Title
   */
  const generateAdPrimaryTextSuggestions = async (platformIndex: number) => {
    const platform = formData.platforms[platformIndex];
    if (!platform?.manualAdTitle) {
      setAdPrimaryTextError('Please select an Ad Title first');
      return;
    }

    if (!formData.offerId || !formData.copyMaster || !formData.country || !formData.language) {
      setAdPrimaryTextError('Complete Phase 1 first (Offer, Copy Master, Country, Language)');
      return;
    }

    setLoadingAdPrimaryText(true);
    setAdPrimaryTextError(null);
    setAdPrimaryTextSuggestions([]);

    try {
      const selectedOffer = offers.find(o => o.id === formData.offerId);

      const response = await fetch('/api/ai/ad-copy-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'primaryText',
          offerName: selectedOffer?.name || '',
          copyMaster: formData.copyMaster,
          selectedTitle: platform.manualAdTitle,
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate primary text suggestions');
      }

      setAdPrimaryTextSuggestions(result.data.primaryTexts || []);
    } catch (error: any) {
      setAdPrimaryTextError(error.message);
    } finally {
      setLoadingAdPrimaryText(false);
    }
  };

  /**
   * Select a Primary Text suggestion (keeps suggestions visible like Copy Master)
   */
  const selectAdPrimaryTextSuggestion = (platformIndex: number, primaryText: string) => {
    updatePlatform(platformIndex, 'manualPrimaryText', primaryText);
    // Clear description suggestions when primary text changes (user needs to regenerate)
    setAdDescriptionSuggestions([]);
  };

  /**
   * Step 3: Generate Description suggestions (max 120 chars)
   * Requires: selected Ad Title + Primary Text
   */
  const generateAdDescriptionSuggestions = async (platformIndex: number) => {
    const platform = formData.platforms[platformIndex];
    if (!platform?.manualAdTitle || !platform?.manualPrimaryText) {
      setAdDescriptionError('Please select an Ad Title and Primary Text first');
      return;
    }

    if (!formData.offerId || !formData.copyMaster || !formData.country || !formData.language) {
      setAdDescriptionError('Complete Phase 1 first (Offer, Copy Master, Country, Language)');
      return;
    }

    setLoadingAdDescription(true);
    setAdDescriptionError(null);
    setAdDescriptionSuggestions([]);

    try {
      const selectedOffer = offers.find(o => o.id === formData.offerId);

      const response = await fetch('/api/ai/ad-copy-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'description',
          offerName: selectedOffer?.name || '',
          copyMaster: formData.copyMaster,
          selectedTitle: platform.manualAdTitle,
          selectedPrimaryText: platform.manualPrimaryText,
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate description suggestions');
      }

      setAdDescriptionSuggestions(result.data.descriptions || []);
    } catch (error: any) {
      setAdDescriptionError(error.message);
    } finally {
      setLoadingAdDescription(false);
    }
  };

  /**
   * Select a Description suggestion (keeps suggestions visible like Copy Master)
   */
  const selectAdDescriptionSuggestion = (platformIndex: number, description: string) => {
    updatePlatform(platformIndex, 'manualDescription', description);
  };

  /**
   * Generate Ad Copy suggestions for TikTok (adText only)
   */
  const generateTiktokAdCopySuggestions = async (platformIndex: number) => {
    if (!formData.offerId || !formData.copyMaster || !formData.country || !formData.language) {
      setTiktokAdCopyError('Complete Phase 1 first (Offer, Copy Master, Country, Language)');
      return;
    }

    setLoadingTiktokAdCopy(true);
    setTiktokAdCopyError(null);
    setTiktokAdCopySuggestions([]);

    try {
      const selectedOffer = offers.find(o => o.id === formData.offerId);

      const response = await fetch('/api/ai/ad-copy-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerName: selectedOffer?.name || '',
          copyMaster: formData.copyMaster,
          platform: 'TIKTOK',
          country: formData.country,
          language: formData.language,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate suggestions');
      }

      setTiktokAdCopySuggestions(result.data.tiktok || []);
    } catch (error: any) {
      setTiktokAdCopyError(error.message);
    } finally {
      setLoadingTiktokAdCopy(false);
    }
  };

  /**
   * Select a TikTok Ad Copy suggestion
   */
  const selectTiktokAdCopySuggestion = (platformIndex: number, suggestion: { adText: string }) => {
    updatePlatform(platformIndex, 'manualTiktokAdText', suggestion.adText);
    setTiktokAdCopySuggestions([]); // Hide suggestions after selecting
  };

  /**
   * Generate AI images for preview in the wizard
   */
  const generateAIImages = async (platformIndex: number) => {
    const platform = formData.platforms[platformIndex];
    if (!platform) return;

    // Validate required fields
    if (!formData.offerId || !formData.copyMaster || !formData.country || !formData.language) {
      setGenerateImagesError(prev => ({ ...prev, [platformIndex]: 'Complete Phase 1 first (Offer, Copy Master, Country, Language)' }));
      return;
    }

    // Get ad title for the prompt
    const adTitle = platform.manualAdTitle || formData.copyMaster.substring(0, 40);
    if (!adTitle) {
      setGenerateImagesError(prev => ({ ...prev, [platformIndex]: 'Please enter an Ad Title first or have a Copy Master' }));
      return;
    }

    const count = platform.aiMediaCount || 1;
    const selectedOffer = offers.find(o => o.id === formData.offerId);

    setGeneratingImages(prev => ({ ...prev, [platformIndex]: true }));
    setGenerateImagesError(prev => ({ ...prev, [platformIndex]: null }));

    try {
      const response = await fetch('/api/ai/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          category: selectedOffer?.vertical || selectedOffer?.category || selectedOffer?.niche || selectedOffer?.name || 'General',
          country: formData.country,
          language: formData.language,
          adTitle,
          copyMaster: formData.copyMaster,
          platform: platform.platform,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate images');
      }

      // Add new images to existing ones (allows mixing)
      setGeneratedImages(prev => ({
        ...prev,
        [platformIndex]: [...(prev[platformIndex] || []), ...result.data.images],
      }));
    } catch (error: any) {
      setGenerateImagesError(prev => ({ ...prev, [platformIndex]: error.message }));
    } finally {
      setGeneratingImages(prev => ({ ...prev, [platformIndex]: false }));
    }
  };

  /**
   * Remove a single generated image from preview
   */
  const removeGeneratedImage = (platformIndex: number, imageIndex: number) => {
    setGeneratedImages(prev => ({
      ...prev,
      [platformIndex]: (prev[platformIndex] || []).filter((_, i) => i !== imageIndex),
    }));
  };

  /**
   * Clear all generated images for a platform
   */
  const clearGeneratedImages = (platformIndex: number) => {
    setGeneratedImages(prev => ({
      ...prev,
      [platformIndex]: [],
    }));
  };

  /**
   * Validate content generation phrases
   * - Must have 3-5 phrases
   * - Phrases must be unique (no duplicates)
   */
  const validateContentPhrases = () => {
    setPhrasesValidation({ status: 'validating' });

    // Parse phrases from text
    const phrases = contentPhrasesText
      ? contentPhrasesText.split(',').map(p => p.trim()).filter(p => p)
      : [];

    const errors: string[] = [];

    // Check if empty (it's optional, so empty is valid)
    if (phrases.length === 0) {
      setPhrasesValidation({
        status: 'valid',
        message: 'Frases vacías - se generarán con AI automáticamente.',
      });
      return;
    }

    // Check count (3-5 required)
    if (phrases.length < 3) {
      errors.push(`Se requieren al menos 3 frases. Actualmente: ${phrases.length}`);
    } else if (phrases.length > 5) {
      errors.push(`Máximo 5 frases permitidas. Actualmente: ${phrases.length}`);
    }

    // Check for duplicates (case-insensitive)
    const lowerPhrases = phrases.map(p => p.toLowerCase());
    const uniquePhrases = new Set(lowerPhrases);
    if (uniquePhrases.size !== phrases.length) {
      // Find which phrases are duplicated
      const seen = new Set<string>();
      const duplicates: string[] = [];
      lowerPhrases.forEach((phrase, index) => {
        if (seen.has(phrase)) {
          duplicates.push(phrases[index]);
        }
        seen.add(phrase);
      });
      errors.push(`Frases duplicadas encontradas: ${duplicates.join(', ')}`);
    }

    // Check minimum phrase length
    const shortPhrases = phrases.filter(p => p.length < 5);
    if (shortPhrases.length > 0) {
      errors.push(`Frases muy cortas (mínimo 5 caracteres): ${shortPhrases.join(', ')}`);
    }

    if (errors.length > 0) {
      setPhrasesValidation({
        status: 'invalid',
        message: 'Validación fallida',
        errors,
      });
    } else {
      setPhrasesValidation({
        status: 'valid',
        message: `${phrases.length} frases válidas y únicas.`,
      });
    }
  };

  const addPlatform = (platform: 'META' | 'TIKTOK') => {
    // Default to tomorrow at 1:00 AM UTC
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(1, 0, 0, 0);
    const defaultDateTime = tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm

    const newPlatform: PlatformConfig = {
      platform,
      performanceGoal: platform === 'META' ? 'Lead Generation' : 'Lead Generation',
      budget: platform === 'META' ? '5' : '50',
      startDateTime: defaultDateTime,
      generateWithAI: true,
      // TikTok only allows videos, Meta allows both
      aiMediaType: platform === 'TIKTOK' ? 'VIDEO' : 'IMAGE',
      aiMediaCount: 1,
      adsPerAdSet: 1, // For ABO: How many ads per ad set
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
    // Validate budgets before submitting
    for (const platform of formData.platforms) {
      const budget = parseFloat(platform.budget);
      const minBudget = platform.platform === 'TIKTOK' ? 50 : 5;
      if (isNaN(budget) || budget < minBudget) {
        setError(`${platform.platform} requires a minimum budget of $${minBudget} USD`);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setIsLaunching(true);
    setLaunchLogs([]);
    setLaunchComplete(false);
    setLaunchSuccess(false);

    try {
      // STEP 1: Create campaign (async mode - returns immediately)
      const logId1 = addLog('Creando campaña...');

      // DEBUG: Log adsPerAdSet values before sending
      console.log('[Wizard] DEBUG: adsPerAdSet values being sent:', formData.platforms.map(p => ({
        platform: p.platform,
        adsPerAdSet: p.adsPerAdSet,
        typeOf: typeof p.adsPerAdSet,
      })));

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
        const errorMessage = data.error || 'Error creating campaign';
        addLog(`Error: ${errorMessage}`, 'error');

        // Guardar detalles del error para mostrar en el modal
        let suggestion = '';
        const lowerError = errorMessage.toLowerCase();
        if (lowerError.includes('content generation phrases')) {
          suggestion = 'Las frases de generación de contenido deben ser únicas. Verifica que no haya frases repetidas.';
        } else if (lowerError.includes('token') || lowerError.includes('access')) {
          suggestion = 'Verifica que los tokens de acceso estén vigentes.';
        } else if (lowerError.includes('400')) {
          suggestion = 'Error de validación. Revisa que todos los campos estén correctamente configurados.';
        } else if (lowerError.includes('401') || lowerError.includes('403')) {
          suggestion = 'Error de autenticación. Verifica las credenciales de la cuenta.';
        }

        setErrorDetails({
          message: errorMessage,
          details: data.details || data.technicalDetails || JSON.stringify(data, null, 2),
          suggestion: suggestion || 'Revisa los logs del servidor para más información.',
          tonicData: data.tonicData || undefined,
        });
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
        addLog('Subiendo archivos...', 'in_progress');

        // Track uploaded media IDs for linking thumbnails to videos
        const uploadedMediaMap: Record<string, string> = {}; // tempFileId -> serverMediaId

        // Helper function to upload a single file using direct GCS upload
        const uploadFileDirectToGCS = async (
          file: File,
          mediaType: 'IMAGE' | 'VIDEO',
          platformName: string | null,
          linkedVideoId?: string
        ): Promise<string | null> => {
          try {
            // Step 1: Get signed URL for upload
            console.log(`[Wizard] Getting upload URL for ${file.name}...`);
            const urlRes = await fetch(`/api/campaigns/${campaignId}/media/upload-url`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                fileType: file.type,
                mediaType,
                platform: platformName,
              }),
            });

            const urlData = await urlRes.json();
            if (!urlData.success) {
              throw new Error(urlData.error || 'Failed to get upload URL');
            }

            const { uploadUrl, gcsPath } = urlData.data;

            // Step 2: Upload directly to GCS
            console.log(`[Wizard] Uploading ${file.name} directly to GCS...`);
            const uploadRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': file.type,
              },
              body: file,
            });

            if (!uploadRes.ok) {
              throw new Error(`GCS upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
            }

            // Step 3: Confirm upload and register in database
            console.log(`[Wizard] Confirming upload for ${file.name}...`);
            const confirmRes = await fetch(`/api/campaigns/${campaignId}/media/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gcsPath,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                mediaType,
                platform: platformName,
                linkedVideoId,
              }),
            });

            const confirmData = await confirmRes.json();
            if (!confirmData.success) {
              throw new Error(confirmData.error || 'Failed to confirm upload');
            }

            console.log(`[Wizard] ✅ Uploaded ${file.name} successfully (ID: ${confirmData.data.mediaId})`);
            return confirmData.data.mediaId;
          } catch (err: any) {
            console.error(`[Wizard] Error uploading ${file.name}:`, err.message);
            throw err;
          }
        };

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

          try {
            const mediaId = await uploadFileDirectToGCS(
              file,
              mediaType,
              platform?.platform || null
            );
            if (mediaId) {
              uploadedMediaMap[fileId] = mediaId;
            }
          } catch (uploadErr: any) {
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

          try {
            await uploadFileDirectToGCS(
              thumbnailFile,
              'IMAGE',
              videoInfo.platform,
              videoServerId
            );
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

      // STEP 3: Save AI-generated images (from preview)
      const allGeneratedImages = Object.entries(generatedImages);
      const hasGeneratedImages = allGeneratedImages.some(([_, images]) => images.length > 0);

      if (hasGeneratedImages) {
        console.log('[Wizard] Saving AI-generated images...');
        addLog('Guardando imágenes generadas por AI...', 'in_progress');

        for (const [platformIdxStr, images] of allGeneratedImages) {
          const platformIdx = parseInt(platformIdxStr, 10);
          const platform = formData.platforms[platformIdx];
          if (!platform || images.length === 0) continue;

          for (const image of images) {
            try {
              // Save to Media table using the existing endpoint
              const saveRes = await fetch(`/api/campaigns/${campaignId}/media/save-generated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  gcsPath: image.gcsPath,
                  url: image.url,
                  mediaType: 'IMAGE',
                  platform: platform.platform,
                  prompt: image.prompt,
                }),
              });

              const saveData = await saveRes.json();
              if (!saveData.success) {
                console.error('[Wizard] Failed to save generated image:', saveData.error);
              } else {
                console.log(`[Wizard] ✅ Saved generated image (ID: ${saveData.data.mediaId})`);
              }
            } catch (saveErr: any) {
              console.error('[Wizard] Error saving generated image:', saveErr.message);
            }
          }
        }

        addLog('Imágenes generadas guardadas correctamente.', 'success');
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

  // Show loading screen while loading campaign data for cloning
  if (loadingClone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos de la campaña...</p>
          <p className="mt-2 text-sm text-gray-500">Preparando configuración para reintento</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {cloneFromId ? '🔄 Reconfigurar Campaña' : '🚀 Launch New Campaign'}
          </h1>
          <p className="text-gray-600">
            {cloneFromId
              ? 'Los datos de la campaña anterior han sido precargados. Modifica lo necesario y vuelve a lanzar.'
              : 'Create campaigns across Tonic, Meta, and TikTok with AI-powered content'
            }
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
                      {offer.name} {(offer.vertical || offer.category || offer.niche) && `(${offer.vertical || offer.category || offer.niche})`}
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
                  <option value="it">Italiano</option>
                  <option value="nl">Nederlands</option>
                  <option value="pl">Polski</option>
                  <option value="ru">Русский</option>
                  <option value="ja">日本語 (Japanese)</option>
                  <option value="ko">한국어 (Korean)</option>
                  <option value="zh">中文 (Chinese)</option>
                  <option value="ar">العربية (Arabic)</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                  <option value="th">ไทย (Thai)</option>
                  <option value="vi">Tiếng Việt (Vietnamese)</option>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="ms">Bahasa Melayu</option>
                  <option value="tr">Türkçe</option>
                  <option value="sv">Svenska</option>
                  <option value="da">Dansk</option>
                  <option value="fi">Suomi</option>
                  <option value="no">Norsk</option>
                  <option value="el">Ελληνικά (Greek)</option>
                  <option value="he">עברית (Hebrew)</option>
                  <option value="cs">Čeština</option>
                  <option value="hu">Magyar</option>
                  <option value="ro">Română</option>
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

                {/* Generate Suggestions Button - Only show for Tonic Meta */}
                {isTonicMetaSelected() && (
                  <>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={generateCopySuggestions}
                        disabled={loadingSuggestions || !formData.offerId || !formData.country || !formData.language}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {loadingSuggestions ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-700" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                          </>
                        ) : (
                          <>
                            <span className="mr-2">✨</span>
                            Generate 5 Suggestions
                          </>
                        )}
                      </button>

                      {(!formData.offerId || !formData.country || !formData.language) && (
                        <p className="mt-1 text-xs text-gray-500">
                          Select Offer, Country, and Language first to generate suggestions
                        </p>
                      )}
                    </div>

                    {/* Error Message */}
                    {suggestionsError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{suggestionsError}</p>
                      </div>
                    )}

                    {/* Suggestions List */}
                    {copySuggestions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">
                            ✨ Click to select a suggestion:
                          </p>
                          <button
                            type="button"
                            onClick={generateCopySuggestions}
                            disabled={loadingSuggestions}
                            className="text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50"
                          >
                            🔄 Regenerate
                          </button>
                        </div>
                        {copySuggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => selectCopySuggestion(suggestion)}
                            className="w-full text-left p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg hover:from-purple-100 hover:to-blue-100 hover:border-purple-300 transition-all group"
                          >
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                {index + 1}
                              </span>
                              <p className="text-sm text-gray-700 group-hover:text-gray-900">
                                {suggestion}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
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
                  <span className={`text-xs ml-2 ${isKeywordLimitReached() ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                    ({getCurrentKeywordCount()}/{MAX_KEYWORDS})
                  </span>
                </label>
                <textarea
                  value={keywordsText}
                  onChange={(e) => {
                    const newText = e.target.value;
                    // Auto-truncate to MAX_KEYWORDS when typing
                    const keywords = newText.split(',').map(k => k.trim()).filter(k => k);
                    if (keywords.length > MAX_KEYWORDS) {
                      // Keep only first MAX_KEYWORDS
                      const truncated = keywords.slice(0, MAX_KEYWORDS).join(', ');
                      setKeywordsText(truncated);
                      handleInputChange('keywords', keywords.slice(0, MAX_KEYWORDS));
                    } else {
                      setKeywordsText(newText);
                    }
                  }}
                  onBlur={() => {
                    const keywordsArray = keywordsText
                      ? keywordsText.split(',').map(k => k.trim()).filter(k => k).slice(0, MAX_KEYWORDS)
                      : [];
                    handleInputChange('keywords', keywordsArray);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="e.g., car loans, auto financing, vehicle payment plans..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate keywords with commas. AI will generate 6-10 keywords if left empty. Max {MAX_KEYWORDS} keywords.
                </p>

                {/* Keyword limit message */}
                {isKeywordLimitReached() && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">Limite de {MAX_KEYWORDS} keywords alcanzado</p>
                  </div>
                )}

                {/* Generate Keywords Button - Only show for Tonic Meta */}
                {isTonicMetaSelected() && (
                  <>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={generateKeywordsSuggestions}
                        disabled={loadingKeywords || !formData.offerId || !formData.country || !formData.language}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {loadingKeywords ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-green-700" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                          </>
                        ) : (
                          <>
                            <span className="mr-2">🔑</span>
                            Generate 10 Keywords
                          </>
                        )}
                      </button>

                      {!formData.offerId || !formData.country || !formData.language ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Select Offer, Country, and Language first to generate suggestions
                        </p>
                      ) : null}
                    </div>

                    {/* Keywords Error */}
                    {keywordsError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">{keywordsError}</p>
                      </div>
                    )}

                    {/* Keywords Suggestions - Grouped by type */}
                    {keywordSuggestions.length > 0 && (
                      <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">
                            🔑 Click to add keywords: {isKeywordLimitReached() && <span className="text-amber-600">(limite alcanzado)</span>}
                          </p>
                          <button
                            type="button"
                            onClick={generateKeywordsSuggestions}
                            disabled={loadingKeywords}
                            className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            🔄 Regenerate
                          </button>
                        </div>

                        {/* Financial Focus (5) */}
                        <div>
                          <p className="text-xs font-semibold text-blue-700 mb-1">💰 Financial Focus (5)</p>
                          <div className="flex flex-wrap gap-2">
                            {keywordSuggestions.filter(s => s.type === 'financial').map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => addKeywordSuggestion(s.keyword)}
                                disabled={isKeywordLimitReached()}
                                className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                                  isKeywordLimitReached()
                                    ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                                    : 'text-blue-800 bg-blue-100 border border-blue-300 hover:bg-blue-200'
                                }`}
                              >
                                {s.keyword}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Geographic Focus (1) */}
                        <div>
                          <p className="text-xs font-semibold text-orange-700 mb-1">📍 Geographic Focus (1)</p>
                          <div className="flex flex-wrap gap-2">
                            {keywordSuggestions.filter(s => s.type === 'geographic').map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => addKeywordSuggestion(s.keyword)}
                                disabled={isKeywordLimitReached()}
                                className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                                  isKeywordLimitReached()
                                    ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                                    : 'text-orange-800 bg-orange-100 border border-orange-300 hover:bg-orange-200'
                                }`}
                              >
                                {s.keyword}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Need Focus (2) */}
                        <div>
                          <p className="text-xs font-semibold text-purple-700 mb-1">🎯 Need Focus (2)</p>
                          <div className="flex flex-wrap gap-2">
                            {keywordSuggestions.filter(s => s.type === 'need').map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => addKeywordSuggestion(s.keyword)}
                                disabled={isKeywordLimitReached()}
                                className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                                  isKeywordLimitReached()
                                    ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                                    : 'text-purple-800 bg-purple-100 border border-purple-300 hover:bg-purple-200'
                                }`}
                              >
                                {s.keyword}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Urgency Focus (2) */}
                        <div>
                          <p className="text-xs font-semibold text-red-700 mb-1">⚡ Urgency Focus (2)</p>
                          <div className="flex flex-wrap gap-2">
                            {keywordSuggestions.filter(s => s.type === 'urgency').map((s, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => addKeywordSuggestion(s.keyword)}
                                disabled={isKeywordLimitReached()}
                                className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                                  isKeywordLimitReached()
                                    ? 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                                    : 'text-red-800 bg-red-100 border border-red-300 hover:bg-red-200'
                                }`}
                              >
                                {s.keyword}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                  onChange={(e) => {
                    setContentPhrasesText(e.target.value);
                    // Reset validation when text changes
                    if (phrasesValidation.status !== 'idle') {
                      setPhrasesValidation({ status: 'idle' });
                    }
                  }}
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
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    Separate phrases with commas. AI will generate 3-5 phrases if left empty. These are used by Tonic for RSOC article generation.
                  </p>
                  <button
                    type="button"
                    onClick={validateContentPhrases}
                    disabled={phrasesValidation.status === 'validating'}
                    className="ml-2 px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300 whitespace-nowrap"
                  >
                    {phrasesValidation.status === 'validating' ? 'Validando...' : 'Validar Frases'}
                  </button>
                </div>
                {formData.contentGenerationPhrases.length > 0 &&
                 (formData.contentGenerationPhrases.length < 3 || formData.contentGenerationPhrases.length > 5) && (
                  <p className="text-xs text-red-600 mt-1 font-medium">
                    Must have between 3 and 5 phrases. Currently: {formData.contentGenerationPhrases.length}
                  </p>
                )}
                {/* Validation result */}
                {phrasesValidation.status === 'valid' && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700 font-medium flex items-center gap-1">
                      <span>✓</span> {phrasesValidation.message}
                    </p>
                  </div>
                )}
                {phrasesValidation.status === 'invalid' && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700 font-medium mb-1">✗ {phrasesValidation.message}</p>
                    {phrasesValidation.errors && phrasesValidation.errors.map((error, i) => (
                      <p key={i} className="text-xs text-red-600 pl-4">• {error}</p>
                    ))}
                  </div>
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
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'NONE', label: 'None', icon: '✓', desc: 'No special category' },
                            { value: 'HOUSING', label: 'Housing', icon: '🏠', desc: 'Real estate ads' },
                            { value: 'CREDIT', label: 'Credit', icon: '💳', desc: 'Financial services' },
                            { value: 'EMPLOYMENT', label: 'Employment', icon: '💼', desc: 'Job listings' },
                            { value: 'ISSUES_ELECTIONS_POLITICS', label: 'Politics', icon: '🗳️', desc: 'Political content' },
                          ].map((category) => {
                            const currentCategories = platform.specialAdCategories || [];
                            const isSelected = currentCategories.includes(category.value);
                            const isNone = category.value === 'NONE';
                            const noneSelected = currentCategories.includes('NONE') || currentCategories.length === 0;

                            return (
                              <button
                                key={category.value}
                                type="button"
                                onClick={() => {
                                  let newCategories: string[];
                                  if (isNone) {
                                    newCategories = ['NONE'];
                                  } else {
                                    if (isSelected) {
                                      newCategories = currentCategories.filter(c => c !== category.value);
                                      if (newCategories.length === 0) newCategories = ['NONE'];
                                    } else {
                                      newCategories = [...currentCategories.filter(c => c !== 'NONE'), category.value];
                                    }
                                  }
                                  updatePlatform(index, 'specialAdCategories', newCategories);
                                }}
                                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${
                                  (isNone && noneSelected) || (!isNone && isSelected)
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                <span className="text-lg">{category.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm">{category.label}</div>
                                  <div className="text-xs opacity-75 truncate">{category.desc}</div>
                                </div>
                                {((isNone && noneSelected) || (!isNone && isSelected)) && (
                                  <span className="text-blue-500">✓</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          Select applicable categories. Multiple categories can be selected except &quot;None&quot;.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Daily Budget (USD)
                        <span className="text-xs text-gray-500 ml-2">
                          (Min: ${platform.platform === 'TIKTOK' ? '50' : '5'})
                        </span>
                      </label>
                      <input
                        type="number"
                        value={platform.budget}
                        onChange={(e) =>
                          updatePlatform(index, 'budget', e.target.value)
                        }
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          parseFloat(platform.budget) < (platform.platform === 'TIKTOK' ? 50 : 5)
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-300'
                        }`}
                        min={platform.platform === 'TIKTOK' ? '50' : '5'}
                        required
                      />
                      {parseFloat(platform.budget) < (platform.platform === 'TIKTOK' ? 50 : 5) && (
                        <p className="text-xs text-red-600 mt-1">
                          {platform.platform === 'TIKTOK'
                            ? 'TikTok requires a minimum budget of $50 USD'
                            : 'Meta requires a minimum budget of $5 USD'}
                        </p>
                      )}
                    </div>

                    {/* Ads per AdSet - Only for ABO campaigns */}
                    {formData.campaignType === 'ABO' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ads per AdSet
                          <span className="text-xs text-purple-600 ml-2 font-normal">
                            (ABO mode)
                          </span>
                        </label>
                        <select
                          value={String(platform.adsPerAdSet || 1)}
                          onChange={(e) => {
                            const newValue = parseInt(e.target.value, 10);
                            console.log('[Wizard] adsPerAdSet changed to:', newValue, 'for platform', platform.platform);
                            updatePlatform(index, 'adsPerAdSet', newValue);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="1">1 ad per adset (default)</option>
                          <option value="2">2 ads per adset</option>
                          <option value="3">3 ads per adset</option>
                          <option value="4">4 ads per adset</option>
                          <option value="5">5 ads per adset</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Groups your creatives into adsets. Example: 10 images with "3 ads per adset" = 4 adsets (3+3+3+1)
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date & Time
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
                        Schedule when the campaign should start (your local time).
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

                    {/* AI Media Generation Options - Only shown when AI is enabled */}
                    {platform.generateWithAI && (
                      <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-purple-900 mb-3">
                          🎨 AI Media Generation
                        </h4>
                        <p className="text-xs text-purple-700 mb-4">
                          Generate AI images and preview them before saving your campaign.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                          {/* Media Type Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Media Type
                            </label>
                            {platform.platform === 'TIKTOK' ? (
                              <>
                                <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600">
                                  Videos only
                                </div>
                                <p className="text-xs text-orange-600 mt-1">
                                  ⚠️ TikTok only allows video ads
                                </p>
                              </>
                            ) : (
                              <select
                                value={platform.aiMediaType || 'IMAGE'}
                                onChange={(e) => updatePlatform(index, 'aiMediaType', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                              >
                                <option value="IMAGE">Images only</option>
                                <option value="VIDEO">Videos only</option>
                                <option value="BOTH">Images + Videos</option>
                              </select>
                            )}
                          </div>

                          {/* Media Count */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Quantity
                            </label>
                            <select
                              value={platform.aiMediaCount || 1}
                              onChange={(e) => updatePlatform(index, 'aiMediaCount', parseInt(e.target.value))}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                            >
                              <option value={1}>1 creative</option>
                              <option value={2}>2 creatives</option>
                              <option value={3}>3 creatives</option>
                              <option value={4}>4 creatives</option>
                              <option value={5}>5 creatives</option>
                            </select>
                          </div>

                        </div>

                        {/* Generate Images Button - Only for Meta with IMAGE or BOTH */}
                        {platform.platform === 'META' && (platform.aiMediaType === 'IMAGE' || platform.aiMediaType === 'BOTH' || !platform.aiMediaType) && (
                          <div className="mt-4">
                            <button
                              type="button"
                              onClick={() => generateAIImages(index)}
                              disabled={generatingImages[index] || !formData.offerId || !formData.copyMaster}
                              className="w-full px-4 py-3 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {generatingImages[index] ? (
                                <>
                                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Generating {platform.aiMediaCount || 1} image(s)...
                                </>
                              ) : (
                                <>
                                  <span>✨</span>
                                  Generate {platform.aiMediaCount || 1} AI Image{(platform.aiMediaCount || 1) > 1 ? 's' : ''}
                                </>
                              )}
                            </button>
                            <p className="text-xs text-purple-600 mt-1 text-center">
                              Images will be generated and shown below for preview
                            </p>
                          </div>
                        )}

                        {/* Error message */}
                        {generateImagesError[index] && (
                          <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded-lg text-xs text-red-700">
                            {generateImagesError[index]}
                          </div>
                        )}

                        {/* Generated Images Preview */}
                        {generatedImages[index] && generatedImages[index].length > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-sm font-medium text-purple-900">
                                Generated Images ({generatedImages[index].length})
                              </h5>
                              <button
                                type="button"
                                onClick={() => clearGeneratedImages(index)}
                                className="text-xs text-red-600 hover:text-red-700 hover:underline"
                              >
                                Clear all
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                              {generatedImages[index].map((image, imgIdx) => (
                                <div key={imgIdx} className="relative group">
                                  <div className="aspect-square rounded-lg overflow-hidden border-2 border-purple-200 bg-white">
                                    <img
                                      src={image.url}
                                      alt={`Generated image ${imgIdx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  {/* Delete button overlay */}
                                  <button
                                    type="button"
                                    onClick={() => removeGeneratedImage(index, imgIdx)}
                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                    title="Remove image"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                  {/* Image number badge */}
                                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 text-white text-xs rounded">
                                    #{imgIdx + 1}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Hover over images to see delete button. These images will be saved with your campaign.
                            </p>
                          </div>
                        )}

                        {/* Info about what will be generated (Videos) */}
                        {(platform.platform === 'TIKTOK' || platform.aiMediaType === 'VIDEO' || platform.aiMediaType === 'BOTH') && (
                          <div className="mt-3 p-2 bg-white rounded border border-purple-100">
                            <p className="text-xs text-gray-600">
                              {platform.platform === 'TIKTOK' ? (
                                <>
                                  <strong>{platform.aiMediaCount || 1} video(s)</strong> will be generated automatically when campaign is approved (9:16 vertical format).
                                </>
                              ) : platform.aiMediaType === 'BOTH' ? (
                                <>
                                  <strong>{platform.aiMediaCount || 1} video(s)</strong> will be generated automatically when campaign is approved (16:9 format with thumbnails).
                                </>
                              ) : (
                                <>
                                  <strong>{platform.aiMediaCount || 1} video(s)</strong> will be generated automatically when campaign is approved (16:9 format with thumbnails).
                                </>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Ad Copy Fields - Only for Meta - Sequential 3-Step Flow */}
                    {platform.platform === 'META' && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-blue-900 mb-2">
                          Ad Copy (Optional) - Sequential Generation
                        </h4>
                        <p className="text-xs text-blue-700 mb-4">
                          Generate ad copy in 3 steps: Title → Primary Text → Description. Each step uses the previous selection to create better suggestions.
                        </p>

                        <div className="space-y-6">
                          {/* STEP 1: Ad Title (Headline) - max 80 chars */}
                          <div className="p-3 bg-white rounded-lg border border-blue-100">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                                <label className="text-sm font-medium text-gray-700">
                                  Ad Title (Headline)
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => generateAdTitleSuggestions(index)}
                                disabled={loadingAdTitles || !formData.offerId || !formData.copyMaster}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {loadingAdTitles ? (
                                  <>
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <span>✨</span>
                                    Generate 5 Titles
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Title error */}
                            {adTitleError && (
                              <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                                {adTitleError}
                              </div>
                            )}

                            {/* Title suggestions - Radio style like Copy Master */}
                            {adTitleSuggestions.length > 0 && (
                              <div className="mb-3 space-y-2">
                                <p className="text-xs font-medium text-blue-800 mb-2">Select a title:</p>
                                {adTitleSuggestions.map((title, suggIdx) => (
                                  <label
                                    key={suggIdx}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                      platform.manualAdTitle === title
                                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`adTitle-${index}`}
                                      checked={platform.manualAdTitle === title}
                                      onChange={() => selectAdTitleSuggestion(index, title)}
                                      className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-800 flex-1">{title}</span>
                                    <span className="text-xs text-gray-400">{title.length} chars</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* Manual input field */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs text-gray-500 mb-2">Or enter custom title:</p>
                              <input
                                type="text"
                                value={platform.manualAdTitle || ''}
                                onChange={(e) => {
                                  updatePlatform(index, 'manualAdTitle', e.target.value);
                                  // Clear dependent suggestions when manually editing
                                  setAdPrimaryTextSuggestions([]);
                                  setAdDescriptionSuggestions([]);
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Enter ad headline (max 80 chars)..."
                                maxLength={80}
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                {(platform.manualAdTitle || '').length}/80 characters
                              </p>
                            </div>
                          </div>

                          {/* STEP 2: Primary Text - max 120 chars */}
                          <div className={`p-3 rounded-lg border ${platform.manualAdTitle ? 'bg-white border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${platform.manualAdTitle ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'}`}>2</span>
                                <label className={`text-sm font-medium ${platform.manualAdTitle ? 'text-gray-700' : 'text-gray-400'}`}>
                                  Primary Text
                                </label>
                                {!platform.manualAdTitle && (
                                  <span className="text-xs text-gray-400 ml-2">Select a title first</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => generateAdPrimaryTextSuggestions(index)}
                                disabled={loadingAdPrimaryText || !platform.manualAdTitle || !formData.offerId || !formData.copyMaster}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {loadingAdPrimaryText ? (
                                  <>
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <span>✨</span>
                                    Generate 5 Texts
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Primary Text error */}
                            {adPrimaryTextError && (
                              <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                                {adPrimaryTextError}
                              </div>
                            )}

                            {/* Primary Text suggestions - Radio style like Copy Master */}
                            {adPrimaryTextSuggestions.length > 0 && (
                              <div className="mb-3 space-y-2">
                                <p className="text-xs font-medium text-blue-800 mb-2">Select a primary text:</p>
                                {adPrimaryTextSuggestions.map((text, suggIdx) => (
                                  <label
                                    key={suggIdx}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                      platform.manualPrimaryText === text
                                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`adPrimaryText-${index}`}
                                      checked={platform.manualPrimaryText === text}
                                      onChange={() => selectAdPrimaryTextSuggestion(index, text)}
                                      className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-800 flex-1">{text}</span>
                                    <span className="text-xs text-gray-400">{text.length} chars</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* Manual input field */}
                            <div className={`mt-3 pt-3 ${adPrimaryTextSuggestions.length > 0 ? 'border-t border-gray-200' : ''}`}>
                              {adPrimaryTextSuggestions.length > 0 && (
                                <p className="text-xs text-gray-500 mb-2">Or enter custom text:</p>
                              )}
                              <textarea
                                value={platform.manualPrimaryText || ''}
                                onChange={(e) => {
                                  updatePlatform(index, 'manualPrimaryText', e.target.value);
                                  // Clear description suggestions when manually editing
                                  setAdDescriptionSuggestions([]);
                                }}
                                disabled={!platform.manualAdTitle}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                rows={2}
                                placeholder={platform.manualAdTitle ? "Enter primary text (max 120 chars)..." : "Select a title first..."}
                                maxLength={120}
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                {(platform.manualPrimaryText || '').length}/120 characters
                              </p>
                            </div>
                          </div>

                          {/* STEP 3: Description - max 120 chars */}
                          <div className={`p-3 rounded-lg border ${platform.manualAdTitle && platform.manualPrimaryText ? 'bg-white border-blue-100' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${platform.manualAdTitle && platform.manualPrimaryText ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'}`}>3</span>
                                <label className={`text-sm font-medium ${platform.manualAdTitle && platform.manualPrimaryText ? 'text-gray-700' : 'text-gray-400'}`}>
                                  Description
                                </label>
                                {(!platform.manualAdTitle || !platform.manualPrimaryText) && (
                                  <span className="text-xs text-gray-400 ml-2">
                                    {!platform.manualAdTitle ? 'Select a title first' : 'Select a primary text first'}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => generateAdDescriptionSuggestions(index)}
                                disabled={loadingAdDescription || !platform.manualAdTitle || !platform.manualPrimaryText || !formData.offerId || !formData.copyMaster}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {loadingAdDescription ? (
                                  <>
                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <span>✨</span>
                                    Generate 5 Descriptions
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Description error */}
                            {adDescriptionError && (
                              <div className="mb-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700">
                                {adDescriptionError}
                              </div>
                            )}

                            {/* Description suggestions - Radio style like Copy Master */}
                            {adDescriptionSuggestions.length > 0 && (
                              <div className="mb-3 space-y-2">
                                <p className="text-xs font-medium text-blue-800 mb-2">Select a description:</p>
                                {adDescriptionSuggestions.map((desc, suggIdx) => (
                                  <label
                                    key={suggIdx}
                                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                      platform.manualDescription === desc
                                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`adDescription-${index}`}
                                      checked={platform.manualDescription === desc}
                                      onChange={() => selectAdDescriptionSuggestion(index, desc)}
                                      className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-800 flex-1">{desc}</span>
                                    <span className="text-xs text-gray-400">{desc.length} chars</span>
                                  </label>
                                ))}
                              </div>
                            )}

                            {/* Manual input field */}
                            <div className={`mt-3 pt-3 ${adDescriptionSuggestions.length > 0 ? 'border-t border-gray-200' : ''}`}>
                              {adDescriptionSuggestions.length > 0 && (
                                <p className="text-xs text-gray-500 mb-2">Or enter custom description:</p>
                              )}
                              <input
                                type="text"
                                value={platform.manualDescription || ''}
                                onChange={(e) => updatePlatform(index, 'manualDescription', e.target.value)}
                                disabled={!platform.manualAdTitle || !platform.manualPrimaryText}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                placeholder={platform.manualAdTitle && platform.manualPrimaryText ? "Enter description (max 120 chars)..." : "Complete previous steps first..."}
                                maxLength={120}
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                {(platform.manualDescription || '').length}/120 characters
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Manual Ad Copy Fields - Only for TikTok */}
                    {platform.platform === 'TIKTOK' && (
                      <div className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-pink-900">
                            Ad Text (Optional)
                          </h4>
                          <button
                            type="button"
                            onClick={() => generateTiktokAdCopySuggestions(index)}
                            disabled={loadingTiktokAdCopy || !formData.offerId || !formData.copyMaster}
                            className="px-3 py-1.5 text-xs font-medium bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            {loadingTiktokAdCopy ? (
                              <>
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Generating...
                              </>
                            ) : (
                              <>
                                <span>✨</span>
                                Generate 5 Suggestions
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-pink-700 mb-4">
                          Leave empty to generate with AI, or click &quot;Generate 5 Suggestions&quot; to get AI recommendations.
                        </p>

                        {/* Error message */}
                        {tiktokAdCopyError && (
                          <div className="mb-4 p-2 bg-red-100 border border-red-200 rounded-lg text-xs text-red-700">
                            {tiktokAdCopyError}
                          </div>
                        )}

                        {/* Suggestions cards */}
                        {tiktokAdCopySuggestions.length > 0 && (
                          <div className="mb-4 space-y-2">
                            <p className="text-xs font-medium text-pink-800 mb-2">Click to select:</p>
                            {tiktokAdCopySuggestions.map((suggestion, suggIdx) => (
                              <button
                                key={suggIdx}
                                type="button"
                                onClick={() => selectTiktokAdCopySuggestion(index, suggestion)}
                                className="w-full p-3 text-left bg-white border border-pink-200 rounded-lg hover:border-pink-400 hover:bg-pink-50 transition-colors"
                              >
                                <span className="text-sm text-gray-800">{suggestion.adText}</span>
                              </button>
                            ))}
                          </div>
                        )}

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
                <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  {errorDetails?.suggestion && (
                    <div className="flex items-start gap-2 mb-3 p-2 bg-yellow-50 rounded border-l-4 border-yellow-400">
                      <span className="text-yellow-600">💡</span>
                      <p className="text-yellow-800 text-sm">{errorDetails.suggestion}</p>
                    </div>
                  )}
                  <p className="text-red-800 text-sm mb-2">
                    Hubo errores durante el lanzamiento.
                  </p>
                  {/* Tonic Data - Most clear error message */}
                  {errorDetails?.tonicData && (
                    <div className="mt-3 p-3 bg-red-100 rounded-lg border border-red-300">
                      <p className="text-red-900 text-sm font-semibold mb-1">Error de Tonic:</p>
                      <p className="text-red-800 text-sm">{errorDetails.tonicData}</p>
                    </div>
                  )}
                  {errorDetails?.details && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                        className="text-red-700 hover:text-red-900 text-sm font-medium flex items-center gap-1"
                      >
                        <span>{showErrorDetails ? '▼' : '▶'}</span>
                        {showErrorDetails ? 'Ocultar' : 'Ver'} detalles técnicos
                      </button>
                      {showErrorDetails && (
                        <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto font-mono">
                          {errorDetails.details}
                        </pre>
                      )}
                    </div>
                  )}
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
                    setPhrasesValidation({ status: 'idle' });
                    setError(null);
                    setErrorDetails(null);
                    setShowErrorDetails(false);
                    // Generate new session ID for next campaign (prevents race conditions)
                    wizardSessionIdRef.current = `wizard-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
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
