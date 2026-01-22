/**
 * Allowed Countries Configuration
 *
 * This file defines which countries are allowed for campaign launches
 * based on Tonic's GEO restrictions as of January 2026.
 *
 * Platform-specific restrictions:
 * - Tonic: 87 countries allowed
 * - Meta: 87 countries allowed (same as Tonic)
 * - TikTok: 85 countries allowed (JP and KR excluded from monetization)
 *
 * IMPORTANT: If a country is NOT in this list, campaigns cannot be launched there.
 * The "Worldwide" option will only target countries in the allowed list.
 */

export interface AllowedCountry {
  code: string;      // ISO 3166-1 alpha-2 code
  name: string;      // Country name
  region: string;    // Geographic region for grouping
}

/**
 * List of 87 countries allowed for Tonic and Meta
 */
export const ALLOWED_COUNTRIES: AllowedCountry[] = [
  // Europe - Western
  { code: 'AD', name: 'Andorra', region: 'Europe' },
  { code: 'AT', name: 'Austria', region: 'Europe' },
  { code: 'BE', name: 'Belgium', region: 'Europe' },
  { code: 'CH', name: 'Switzerland', region: 'Europe' },
  { code: 'DE', name: 'Germany', region: 'Europe' },
  { code: 'DK', name: 'Denmark', region: 'Europe' },
  { code: 'ES', name: 'Spain', region: 'Europe' },
  { code: 'FI', name: 'Finland', region: 'Europe' },
  { code: 'FO', name: 'Faroe Islands', region: 'Europe' },
  { code: 'FR', name: 'France', region: 'Europe' },
  { code: 'GB', name: 'United Kingdom', region: 'Europe' },
  { code: 'GG', name: 'Guernsey', region: 'Europe' },
  { code: 'GL', name: 'Greenland', region: 'Europe' },
  { code: 'IE', name: 'Ireland', region: 'Europe' },
  { code: 'IM', name: 'Isle of Man', region: 'Europe' },
  { code: 'IS', name: 'Iceland', region: 'Europe' },
  { code: 'IT', name: 'Italy', region: 'Europe' },
  { code: 'JE', name: 'Jersey', region: 'Europe' },
  { code: 'LI', name: 'Liechtenstein', region: 'Europe' },
  { code: 'LU', name: 'Luxembourg', region: 'Europe' },
  { code: 'MC', name: 'Monaco', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', region: 'Europe' },
  { code: 'NO', name: 'Norway', region: 'Europe' },
  { code: 'PT', name: 'Portugal', region: 'Europe' },
  { code: 'SE', name: 'Sweden', region: 'Europe' },
  { code: 'SM', name: 'San Marino', region: 'Europe' },

  // Europe - Eastern
  { code: 'BG', name: 'Bulgaria', region: 'Europe' },
  { code: 'CY', name: 'Cyprus', region: 'Europe' },
  { code: 'CZ', name: 'Czechia', region: 'Europe' },
  { code: 'EE', name: 'Estonia', region: 'Europe' },
  { code: 'GR', name: 'Greece', region: 'Europe' },
  { code: 'HU', name: 'Hungary', region: 'Europe' },
  { code: 'LT', name: 'Lithuania', region: 'Europe' },
  { code: 'LV', name: 'Latvia', region: 'Europe' },
  { code: 'MT', name: 'Malta', region: 'Europe' },
  { code: 'PL', name: 'Poland', region: 'Europe' },
  { code: 'RO', name: 'Romania', region: 'Europe' },
  { code: 'SI', name: 'Slovenia', region: 'Europe' },
  { code: 'SK', name: 'Slovakia', region: 'Europe' },
  { code: 'TR', name: 'Turkey', region: 'Europe' },
  { code: 'UA', name: 'Ukraine', region: 'Europe' },

  // Americas - North America
  { code: 'CA', name: 'Canada', region: 'North America' },
  { code: 'US', name: 'United States', region: 'North America' },
  { code: 'MX', name: 'Mexico', region: 'North America' },

  // Americas - Caribbean & Central America
  { code: 'AI', name: 'Anguilla', region: 'Caribbean' },
  { code: 'AW', name: 'Aruba', region: 'Caribbean' },
  { code: 'BM', name: 'Bermuda', region: 'Caribbean' },
  { code: 'BQ', name: 'Caribbean Netherlands', region: 'Caribbean' },
  { code: 'CW', name: 'Curaçao', region: 'Caribbean' },
  { code: 'GU', name: 'Guam', region: 'Caribbean' },
  { code: 'KY', name: 'Cayman Islands', region: 'Caribbean' },
  { code: 'PR', name: 'Puerto Rico', region: 'Caribbean' },
  { code: 'SX', name: 'Sint Maarten', region: 'Caribbean' },
  { code: 'TC', name: 'Turks & Caicos Islands', region: 'Caribbean' },
  { code: 'VG', name: 'British Virgin Islands', region: 'Caribbean' },
  { code: 'VI', name: 'U.S. Virgin Islands', region: 'Caribbean' },

  // Americas - South America
  { code: 'AR', name: 'Argentina', region: 'South America' },
  { code: 'BR', name: 'Brazil', region: 'South America' },
  { code: 'CL', name: 'Chile', region: 'South America' },
  { code: 'CO', name: 'Colombia', region: 'South America' },

  // Middle East
  { code: 'AE', name: 'United Arab Emirates', region: 'Middle East' },
  { code: 'BH', name: 'Bahrain', region: 'Middle East' },
  { code: 'IL', name: 'Israel', region: 'Middle East' },
  { code: 'KW', name: 'Kuwait', region: 'Middle East' },
  { code: 'OM', name: 'Oman', region: 'Middle East' },
  { code: 'QA', name: 'Qatar', region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', region: 'Middle East' },

  // Asia Pacific
  { code: 'AU', name: 'Australia', region: 'Asia Pacific' },
  { code: 'BN', name: 'Brunei', region: 'Asia Pacific' },
  { code: 'HK', name: 'Hong Kong', region: 'Asia Pacific' },
  { code: 'JP', name: 'Japan', region: 'Asia Pacific' },      // Excluded from TikTok
  { code: 'KR', name: 'South Korea', region: 'Asia Pacific' }, // Excluded from TikTok
  { code: 'MO', name: 'Macao', region: 'Asia Pacific' },
  { code: 'NZ', name: 'New Zealand', region: 'Asia Pacific' },
  { code: 'SG', name: 'Singapore', region: 'Asia Pacific' },
  { code: 'TH', name: 'Thailand', region: 'Asia Pacific' },
  { code: 'TW', name: 'Taiwan', region: 'Asia Pacific' },
];

/**
 * Countries excluded from TikTok monetization
 * These are allowed for Tonic and Meta, but NOT for TikTok
 */
export const TIKTOK_EXCLUDED_COUNTRIES = new Set(['JP', 'KR']);

/**
 * Set of allowed country codes for fast lookup (Tonic/Meta - 87 countries)
 */
export const ALLOWED_COUNTRY_CODES = new Set(ALLOWED_COUNTRIES.map(c => c.code));

/**
 * Set of allowed country codes for TikTok (85 countries - excludes JP and KR)
 */
export const TIKTOK_ALLOWED_COUNTRY_CODES = new Set(
  ALLOWED_COUNTRIES.filter(c => !TIKTOK_EXCLUDED_COUNTRIES.has(c.code)).map(c => c.code)
);

/**
 * Check if a country code is allowed (for Tonic/Meta)
 */
export function isCountryAllowed(countryCode: string): boolean {
  return ALLOWED_COUNTRY_CODES.has(countryCode.toUpperCase());
}

/**
 * Check if a country code is allowed for TikTok
 */
export function isCountryAllowedForTikTok(countryCode: string): boolean {
  const code = countryCode.toUpperCase();
  return ALLOWED_COUNTRY_CODES.has(code) && !TIKTOK_EXCLUDED_COUNTRIES.has(code);
}

/**
 * Filter a list of countries to only include allowed ones
 */
export function filterAllowedCountries<T extends { code: string }>(countries: T[]): T[] {
  return countries.filter(c => isCountryAllowed(c.code));
}

/**
 * Get all allowed country codes as an array (Tonic/Meta - 87)
 */
export function getAllowedCountryCodes(): string[] {
  return ALLOWED_COUNTRIES.map(c => c.code);
}

/**
 * Get all allowed country codes for TikTok (85 - excludes JP and KR)
 */
export function getTikTokAllowedCountryCodes(): string[] {
  return ALLOWED_COUNTRIES
    .filter(c => !TIKTOK_EXCLUDED_COUNTRIES.has(c.code))
    .map(c => c.code);
}

/**
 * Get countries grouped by region
 */
export function getCountriesByRegion(): Record<string, AllowedCountry[]> {
  return ALLOWED_COUNTRIES.reduce((acc, country) => {
    if (!acc[country.region]) {
      acc[country.region] = [];
    }
    acc[country.region].push(country);
    return acc;
  }, {} as Record<string, AllowedCountry[]>);
}

/**
 * WORLDWIDE targeting - represents all allowed countries
 * Tonic API uses "WO" as the country code for worldwide targeting
 * When a campaign uses "WO", it will target all countries in ALLOWED_COUNTRIES
 */
export const WORLDWIDE_OPTION = {
  code: 'WO',  // Tonic's worldwide code
  name: 'Worldwide (87 allowed countries)',
  region: 'Global',
  description: 'Target all 87 countries where campaigns are permitted. Does NOT include restricted GEOs.',
  countryCodes: getAllowedCountryCodes(),
};

/**
 * Check if the selection is worldwide
 * Tonic uses "WO" for worldwide
 */
export function isWorldwide(countryCode: string): boolean {
  return countryCode === 'WO';
}

/**
 * Get the actual country codes for a selection (handles WORLDWIDE)
 * For Tonic/Meta targeting
 */
export function resolveCountryCodes(countryCode: string): string[] {
  if (isWorldwide(countryCode)) {
    return getAllowedCountryCodes();
  }
  return [countryCode];
}

/**
 * Get the actual country codes for TikTok (handles WORLDWIDE)
 * Excludes JP and KR which are not allowed for TikTok monetization
 */
export function resolveCountryCodesForTikTok(countryCode: string): string[] {
  if (isWorldwide(countryCode)) {
    return getTikTokAllowedCountryCodes();
  }
  // If single country, check if it's allowed for TikTok
  if (TIKTOK_EXCLUDED_COUNTRIES.has(countryCode.toUpperCase())) {
    console.warn(`[GEO] Country ${countryCode} is excluded from TikTok monetization`);
    return [];
  }
  return [countryCode];
}

/**
 * Language to default country mapping for article creation
 * When WORLDWIDE is selected, we need a specific country for the article content
 */
const LANGUAGE_DEFAULT_COUNTRY: Record<string, string> = {
  'en': 'US',  // English -> United States
  'es': 'MX',  // Spanish -> Mexico
  'fr': 'FR',  // French -> France
  'de': 'DE',  // German -> Germany
  'pt': 'BR',  // Portuguese -> Brazil
  'it': 'IT',  // Italian -> Italy
  'nl': 'NL',  // Dutch -> Netherlands
  'pl': 'PL',  // Polish -> Poland
  'tr': 'TR',  // Turkish -> Turkey
  'ja': 'JP',  // Japanese -> Japan
  'ko': 'KR',  // Korean -> South Korea
  'zh': 'TW',  // Chinese -> Taiwan
  'ar': 'SA',  // Arabic -> Saudi Arabia
  'he': 'IL',  // Hebrew -> Israel
  'ro': 'RO',  // Romanian -> Romania
  'el': 'GR',  // Greek -> Greece
  'hu': 'HU',  // Hungarian -> Hungary
  'cs': 'CZ',  // Czech -> Czechia
  'sk': 'SK',  // Slovak -> Slovakia
  'bg': 'BG',  // Bulgarian -> Bulgaria
  'uk': 'UA',  // Ukrainian -> Ukraine
  'sv': 'SE',  // Swedish -> Sweden
  'no': 'NO',  // Norwegian -> Norway
  'da': 'DK',  // Danish -> Denmark
  'fi': 'FI',  // Finnish -> Finland
};

/**
 * Get the default country for article creation based on language
 * Used when WORLDWIDE is selected - articles need a specific country context
 */
export function getDefaultCountryForLanguage(language: string): string {
  const lang = language.toLowerCase().substring(0, 2); // Handle 'en-US' style codes
  return LANGUAGE_DEFAULT_COUNTRY[lang] || 'US'; // Default to US if language not mapped
}

/**
 * Resolve country for Tonic article creation
 * Tonic API accepts "WO" for worldwide articles, so we pass it through
 * The language-based default is kept for potential future use
 */
export function resolveCountryForArticle(countryCode: string, language: string): string {
  // Tonic accepts "WO" for worldwide - no conversion needed
  return countryCode;
}
