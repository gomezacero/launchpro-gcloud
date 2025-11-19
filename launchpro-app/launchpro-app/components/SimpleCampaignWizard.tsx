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
  accountType: 'TONIC' | 'META' | 'TIKTOK';
}

/**
 * Simplified Campaign Wizard - 2 Steps
 *
 * Step 1: Basic Configuration (8 essential fields)
 * Step 2: Review & Launch
 *
 * Everything else is automated by the backend:
 * - Copy Master generation
 * - Keywords generation (6-10)
 * - Article generation (RSOC)
 * - Image/Video generation
 * - Ad Copy optimization per platform
 * - Targeting (Advantage+ for Meta, Smart+ for TikTok)
 */
export default function SimpleCampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from APIs
  const [offers, setOffers] = useState<Offer[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [tonicAccounts, setTonicAccounts] = useState<Account[]>([]);

  // Form data - Only essential fields
  const [formData, setFormData] = useState({
    name: '',
    offerId: '',
    country: '',
    language: 'en',
    platforms: [] as ('META' | 'TIKTOK')[],
    budget: '50',
    startDate: new Date().toISOString().split('T')[0],
  });

  // Auto-selected Tonic account based on platforms
  const [selectedTonicAccount, setSelectedTonicAccount] = useState<string>('');

  // Load data on mount
  useEffect(() => {
    loadOffers();
    loadTonicAccounts();
  }, []);

  // Load countries when offer is selected
  useEffect(() => {
    if (formData.offerId) {
      loadCountries();
    }
  }, [formData.offerId]);

  // Auto-select Tonic account based on platforms
  useEffect(() => {
    if (formData.platforms.length > 0) {
      // If both platforms selected, use Tonic Meta (it's more common)
      // If only TikTok, use Tonic TikTok
      // If only Meta, use Tonic Meta
      const needsTikTok = formData.platforms.includes('TIKTOK') && formData.platforms.length === 1;
      const tonicAccount = tonicAccounts.find(acc =>
        needsTikTok ? acc.name === 'Tonic TikTok' : acc.name === 'Tonic Meta'
      );
      if (tonicAccount) {
        setSelectedTonicAccount(tonicAccount.id);
      }
    }
  }, [formData.platforms, tonicAccounts]);

  // Auto-suggest language based on country
  useEffect(() => {
    if (formData.country) {
      const languageMap: Record<string, string> = {
        'US': 'en', 'GB': 'en', 'CA': 'en', 'AU': 'en',
        'ES': 'es', 'MX': 'es', 'AR': 'es', 'CO': 'es',
        'FR': 'fr', 'DE': 'de', 'IT': 'it', 'PT': 'pt', 'BR': 'pt',
      };
      const suggestedLanguage = languageMap[formData.country] || 'en';
      setFormData(prev => ({ ...prev, language: suggestedLanguage }));
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

  const loadTonicAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?type=TONIC');
      const data = await res.json();
      if (data.success) {
        setTonicAccounts(data.data.tonic || []);
      }
    } catch (err: any) {
      console.error('Error loading accounts:', err);
    }
  };

  const handlePlatformToggle = (platform: 'META' | 'TIKTOK') => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.name || !formData.offerId || !formData.country || formData.platforms.length === 0) {
        throw new Error('Please fill in all required fields');
      }

      if (!selectedTonicAccount) {
        throw new Error('Could not determine Tonic account. Please try again.');
      }

      // Build campaign payload
      const payload = {
        name: formData.name,
        campaignType: 'CBO', // Always CBO for simplicity
        tonicAccountId: selectedTonicAccount,
        offerId: formData.offerId,
        country: formData.country,
        language: formData.language,
        // Backend will generate these automatically:
        // - copyMaster
        // - communicationAngle
        // - keywords (6-10)
        platforms: formData.platforms.map(platform => ({
          platform,
          accountId: 'auto', // Backend will select appropriate account
          performanceGoal: platform === 'META' ? 'OUTCOME_LEADS' : 'LEAD_GENERATION',
          budget: parseFloat(formData.budget),
          startDate: formData.startDate,
          generateWithAI: true, // Always generate with AI
        })),
      };

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to create campaign');
      }

      // Redirect to campaign detail page
      router.push(`/campaigns/${data.data.campaignId}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-center space-x-4">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  step >= s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {s}
              </div>
              {s < 2 && (
                <div
                  className={`w-20 h-1 ${
                    step > s ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-center mt-4 space-x-28">
          <span className="text-sm font-medium">Basic Config</span>
          <span className="text-sm font-medium">Review & Launch</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white shadow-lg rounded-lg p-8">
        {/* Step 1: Basic Configuration */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Step 1: Basic Configuration
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Fill in the essential details. Everything else will be generated automatically by AI.
            </p>

            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Car Loans Q1 2025"
              />
            </div>

            {/* Offer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Offer *
              </label>
              <select
                value={formData.offerId}
                onChange={(e) =>
                  setFormData({ ...formData, offerId: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select offer...</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name} {offer.vertical && `(${offer.vertical})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Country */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Country *
              </label>
              <select
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!formData.offerId}
              >
                <option value="">Select country...</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Language (Auto-suggested) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Language *
              </label>
              <select
                value={formData.language}
                onChange={(e) =>
                  setFormData({ ...formData, language: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="pt">Português</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Auto-suggested based on target country
              </p>
            </div>

            {/* Platform Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platform(s) *
              </label>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => handlePlatformToggle('META')}
                  className={`flex-1 px-6 py-4 border-2 rounded-lg font-semibold transition-colors ${
                    formData.platforms.includes('META')
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="text-lg">📘 Meta</div>
                  <div className="text-xs text-gray-600 mt-1">Facebook & Instagram</div>
                </button>
                <button
                  type="button"
                  onClick={() => handlePlatformToggle('TIKTOK')}
                  className={`flex-1 px-6 py-4 border-2 rounded-lg font-semibold transition-colors ${
                    formData.platforms.includes('TIKTOK')
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <div className="text-lg">🎵 TikTok</div>
                  <div className="text-xs text-gray-600 mt-1">TikTok Ads</div>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Select one or both platforms. You can launch to both simultaneously.
              </p>
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Budget (USD) *
              </label>
              <input
                type="number"
                value={formData.budget}
                onChange={(e) =>
                  setFormData({ ...formData, budget: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="50"
                min="1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum: $1 for Meta, $20 for TikTok. Budget applies to each platform.
              </p>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date *
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Navigation */}
            <div className="flex justify-end pt-6 border-t">
              <button
                onClick={() => setStep(2)}
                disabled={
                  !formData.name ||
                  !formData.offerId ||
                  !formData.country ||
                  formData.platforms.length === 0
                }
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Continue to Review
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review & Launch */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Step 2: Review & Launch
            </h2>

            {/* Campaign Summary */}
            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg text-gray-900">Campaign Summary</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Campaign Name</p>
                  <p className="font-medium">{formData.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Offer</p>
                  <p className="font-medium">
                    {offers.find(o => o.id === formData.offerId)?.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Country</p>
                  <p className="font-medium">
                    {countries.find(c => c.code === formData.country)?.name || formData.country}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Language</p>
                  <p className="font-medium">{formData.language.toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Platform(s)</p>
                  <p className="font-medium">{formData.platforms.join(', ')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Daily Budget</p>
                  <p className="font-medium">${formData.budget} USD</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Start Date</p>
                  <p className="font-medium">{formData.startDate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Tonic Account</p>
                  <p className="font-medium">
                    {tonicAccounts.find(a => a.id === selectedTonicAccount)?.name || 'Auto-selected'}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Generation Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                <span className="mr-2">🤖</span> AI-Powered Automation
              </h3>
              <p className="text-sm text-blue-800 mb-3">
                The system will automatically generate:
              </p>
              <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
                <li>
                  <strong>Copy Master</strong> - Optimized main messaging aligned with the offer
                </li>
                <li>
                  <strong>Keywords</strong> - 6-10 high-performing keywords for Tonic
                </li>
                <li>
                  <strong>Article Content</strong> - Engaging RSOC article with headline and teaser
                </li>
                <li>
                  <strong>Ad Copy</strong> - Platform-specific ad text optimized for conversions
                </li>
                <li>
                  <strong>Images & Videos</strong> - Professional creatives generated with Vertex AI
                </li>
                <li>
                  <strong>Targeting</strong> - Automatic audience targeting (Advantage+ / Smart+)
                </li>
              </ul>
            </div>

            {/* Estimated Time */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ⏱️ <strong>Estimated launch time:</strong> 3-5 minutes
                <br />
                This includes AI content generation and deployment to {formData.platforms.join(' & ')}.
              </p>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Launching...
                  </>
                ) : (
                  <>
                    🚀 Launch Campaign
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
