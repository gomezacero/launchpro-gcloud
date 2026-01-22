/**
 * Allowed Countries Configuration
 *
 * This file defines which countries are allowed for campaign launches
 * based on Tonic's GEO restrictions as of January 2026.
 *
 * These restrictions apply to: Tonic, Meta, and TikTok platforms.
 *
 * IMPORTANT: If a country is NOT in this list, campaigns cannot be launched there.
 * The "Worldwide" option will only target countries in this allowed list.
 */

export interface AllowedCountry {
  code: string;      // ISO 3166-1 alpha-2 code
  name: string;      // Country name
  region: string;    // Geographic region for grouping
}

/**
 * List of 87 countries allowed for campaign launches
 * These countries are available for Tonic, Meta, and TikTok
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
  { code: 'MO', name: 'Macao', region: 'Asia Pacific' },
  { code: 'NZ', name: 'New Zealand', region: 'Asia Pacific' },
  { code: 'SG', name: 'Singapore', region: 'Asia Pacific' },
  { code: 'TH', name: 'Thailand', region: 'Asia Pacific' },
  { code: 'TW', name: 'Taiwan', region: 'Asia Pacific' },
];

/**
 * Set of allowed country codes for fast lookup
 */
export const ALLOWED_COUNTRY_CODES = new Set(ALLOWED_COUNTRIES.map(c => c.code));

/**
 * Check if a country code is allowed
 */
export function isCountryAllowed(countryCode: string): boolean {
  return ALLOWED_COUNTRY_CODES.has(countryCode.toUpperCase());
}

/**
 * Filter a list of countries to only include allowed ones
 */
export function filterAllowedCountries<T extends { code: string }>(countries: T[]): T[] {
  return countries.filter(c => isCountryAllowed(c.code));
}

/**
 * Get all allowed country codes as an array
 */
export function getAllowedCountryCodes(): string[] {
  return ALLOWED_COUNTRIES.map(c => c.code);
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
 * When a campaign uses "WORLDWIDE", it will target all countries in ALLOWED_COUNTRIES
 */
export const WORLDWIDE_OPTION = {
  code: 'WORLDWIDE',
  name: 'Worldwide (87 allowed countries)',
  region: 'Global',
  description: 'Target all 87 countries where campaigns are permitted. Does NOT include restricted GEOs.',
  countryCodes: getAllowedCountryCodes(),
};

/**
 * Check if the selection is worldwide
 */
export function isWorldwide(countryCode: string): boolean {
  return countryCode === 'WORLDWIDE';
}

/**
 * Get the actual country codes for a selection (handles WORLDWIDE)
 */
export function resolveCountryCodes(countryCode: string): string[] {
  if (isWorldwide(countryCode)) {
    return getAllowedCountryCodes();
  }
  return [countryCode];
}
