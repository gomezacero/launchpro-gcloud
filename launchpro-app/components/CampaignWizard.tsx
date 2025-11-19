'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  accountType: string;
  metaAdAccountId?: string;
  metaPortfolio?: string;
  tiktokAdvertiserId?: string;
}

interface PlatformConfig {
  platform: 'META' | 'TIKTOK';
  performanceGoal: string;
  budget: string;
  startDate: string;
  generateWithAI: boolean;
  metaAdAccountId?: string;
  tiktokAdvertiserId?: string;
  fanPage?: string;
  pixel?: string;
  instagramPage?: string;
  tiktokPage?: string;
}

export default function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from APIs
  const [offers, setOffers] = useState<Offer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [metaAccounts, setMetaAccounts] = useState<Account[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<Account[]>([]);
  const [tonicAccounts, setTonicAccounts] = useState<Account[]>([]);

  // Ad accounts from Meta/TikTok APIs
  const [metaAdAccounts, setMetaAdAccounts] = useState<any[]>([]);
  const [tiktokAdvertiserAccounts, setTiktokAdvertiserAccounts] = useState<any[]>([]);

  // Form data
  const [formData, setFormData] = useState({
    name: '',
    campaignType: 'CBO' as 'CBO' | 'ABO',
    provider: 'META' as 'META' | 'TIKTOK',
    addAccountId: '',
    tonicAccountId: '',
    offerId: '',
    country: '',
    language: 'en',
    copyMaster: '',
    communicationAngle: '',
    keywords: [] as string[],
    platforms: [] as PlatformConfig[],
  });

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

  // Reset addAccountId and tonicAccountId when provider changes
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      addAccountId: '',
      tonicAccountId: '',
    }));
    setTonicAccounts([]); // Clear tonic accounts when provider changes
  }, [formData.provider]);

  // Load filtered Tonic accounts when addAccountId changes
  useEffect(() => {
    if (formData.addAccountId) {
      loadFilteredTonicAccounts(formData.addAccountId);
    } else {
      setTonicAccounts([]); // Clear tonic accounts if no add account selected
    }
  }, [formData.addAccountId]);

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
        setMetaAccounts(data.data.meta.all || []);
        setTiktokAccounts(data.data.tiktok || []);
        // Don't load tonic accounts here - they will be loaded based on selected Add Account
      }
    } catch (err: any) {
      console.error('Error loading accounts:', err);
    }
  };

  const loadFilteredTonicAccounts = async (addAccountId: string) => {
    try {
      const res = await fetch(`/api/accounts?linkedToAccountId=${addAccountId}`);
      const data = await res.json();
      if (data.success) {
        setTonicAccounts(data.data || []);
        // Reset tonicAccountId if the currently selected one is not in the filtered list
        if (formData.tonicAccountId) {
          const isStillValid = data.data.some((acc: Account) => acc.id === formData.tonicAccountId);
          if (!isStillValid) {
            setFormData((prev) => ({ ...prev, tonicAccountId: '' }));
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading filtered Tonic accounts:', err);
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
      console.error('Error loading ad accounts:', err);
    }
  };

  // Get available accounts based on provider
  const getAvailableAddAccounts = () => {
    return formData.provider === 'META' ? metaAccounts : tiktokAccounts;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addPlatform = (platform: 'META' | 'TIKTOK') => {
    const newPlatform: PlatformConfig = {
      platform,
      performanceGoal: platform === 'META' ? 'Lead Generation' : 'Lead Generation',
      budget: '100',
      startDate: new Date().toISOString().split('T')[0],
      generateWithAI: true,
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

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Launching campaign with data:', formData);

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log('📡 Response status:', res.status, res.statusText);

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error('❌ Server returned non-JSON response:', text.substring(0, 500));
        throw new Error(`Server error: Expected JSON but got ${contentType}. Check server logs.`);
      }

      const data = await res.json();
      console.log('📦 Response data:', data);

      if (data.success) {
        console.log('✅ Campaign created successfully:', data.data.campaignId);
        router.push(`/campaigns/${data.data.campaignId}`);
      } else {
        console.error('❌ Campaign creation failed:', data.error);
        setError(data.error || 'Error creating campaign');
      }
    } catch (err: any) {
      console.error('❌ Exception during campaign creation:', err);
      setError(err.message || 'An unexpected error occurred');
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
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                    step >= s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? 'bg-blue-600' : 'bg-gray-200'
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
                  Provider *
                </label>
                <select
                  value={formData.provider}
                  onChange={(e) =>
                    handleInputChange('provider', e.target.value as 'META' | 'TIKTOK')
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="META">Meta (Facebook/Instagram)</option>
                  <option value="TIKTOK">TikTok</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Account *
                </label>
                <select
                  value={formData.addAccountId}
                  onChange={(e) => handleInputChange('addAccountId', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select an account...</option>
                  {getAvailableAddAccounts().map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {formData.provider === 'META' && account.metaPortfolio && ` (${account.metaPortfolio})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tonic Account *
                </label>
                <select
                  value={formData.tonicAccountId}
                  onChange={(e) => handleInputChange('tonicAccountId', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.addAccountId}
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
                  Campaign Type *
                </label>
                <select
                  value={formData.campaignType}
                  onChange={(e) =>
                    handleInputChange('campaignType', e.target.value)
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="CBO">
                    {formData.provider === 'META' ? 'CBO (Advantage)' : 'CBO (Smart)'}
                  </option>
                  <option value="ABO">
                    {formData.provider === 'META' ? 'ABO (AdSets - Manuales)' : 'ABO (AdSets - Manuales)'}
                  </option>
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
                  Configure Platform: {formData.provider === 'META' ? '📘 Meta (Facebook/Instagram)' : '🎵 TikTok'}
                </label>
                <div className="flex gap-4 mb-4">
                  {formData.platforms.length === 0 && (
                    <button
                      type="button"
                      onClick={() => addPlatform(formData.provider)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      + Add {formData.provider === 'META' ? 'Meta' : 'TikTok'} Platform
                    </button>
                  )}
                </div>
              </div>

              {formData.platforms.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No platform configured yet. Click the button above to add {formData.provider === 'META' ? 'Meta' : 'TikTok'} platform.
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
                    {/* Meta Ad Account Selection */}
                    {platform.platform === 'META' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Meta Ad Account *
                        </label>
                        <select
                          value={platform.metaAdAccountId || ''}
                          onChange={(e) =>
                            updatePlatform(index, 'metaAdAccountId', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select Meta account...</option>
                          {metaAdAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name} ({account.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* TikTok Advertiser Selection */}
                    {platform.platform === 'TIKTOK' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          TikTok Advertiser *
                        </label>
                        <select
                          value={platform.tiktokAdvertiserId || ''}
                          onChange={(e) =>
                            updatePlatform(index, 'tiktokAdvertiserId', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="">Select TikTok advertiser...</option>
                          {tiktokAdvertiserAccounts.map((account) => (
                            <option key={account.advertiser_id} value={account.advertiser_id}>
                              {account.advertiser_name} ({account.advertiser_id})
                            </option>
                          ))}
                        </select>
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

                    {/* Meta-specific fields */}
                    {platform.platform === 'META' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Fan Page
                          </label>
                          <input
                            type="text"
                            value={platform.fanPage || ''}
                            onChange={(e) =>
                              updatePlatform(index, 'fanPage', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Facebook Page ID"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pixel
                          </label>
                          <input
                            type="text"
                            value={platform.pixel || ''}
                            onChange={(e) =>
                              updatePlatform(index, 'pixel', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Meta Pixel ID"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Instagram Page
                          </label>
                          <input
                            type="text"
                            value={platform.instagramPage || ''}
                            onChange={(e) =>
                              updatePlatform(index, 'instagramPage', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Instagram Page ID"
                          />
                        </div>
                      </>
                    )}

                    {/* TikTok-specific fields */}
                    {platform.platform === 'TIKTOK' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pixel
                          </label>
                          <input
                            type="text"
                            value={platform.pixel || ''}
                            onChange={(e) =>
                              updatePlatform(index, 'pixel', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="TikTok Pixel ID"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            TikTok Page
                          </label>
                          <input
                            type="text"
                            value={platform.tiktokPage || ''}
                            onChange={(e) =>
                              updatePlatform(index, 'tiktokPage', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="TikTok Page ID"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Budget (USD)
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
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={platform.startDate}
                        onChange={(e) =>
                          updatePlatform(index, 'startDate', e.target.value)
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
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
                        🤖 Desea generar imágenes o videos con IA
                      </label>
                    </div>
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
                    {formData.platforms.map((p, i) => (
                      <li key={i}>
                        {p.platform} - ${p.budget}/day - {p.performanceGoal}
                        {p.generateWithAI && ' (AI content enabled)'}
                      </li>
                    ))}
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
                      !formData.provider ||
                      !formData.addAccountId ||
                      !formData.tonicAccountId ||
                      !formData.offerId ||
                      !formData.country)) ||
                  (step === 2 && formData.platforms.length === 0)
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
    </div>
  );
}
