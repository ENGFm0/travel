// Offline seasonal weather estimate + clothing advice for a city on given dates.
// No external API (keys would be server-side; the network policy blocks direct
// calls). This is a climate heuristic: city -> climate profile, date -> season,
// then a temperature band, a condition and clothing suggestions. Clearly labelled
// as an estimate in the UI.

export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'AUTUMN';
export type Condition = 'HOT' | 'WARM' | 'MILD' | 'COOL' | 'COLD';
export type Clothing =
  | 'LIGHT' | 'SHORTS' | 'HAT_SUN' | 'SUNSCREEN' | 'LIGHT_JACKET'
  | 'LAYERS' | 'JACKET' | 'COAT' | 'SCARF' | 'UMBRELLA' | 'COMFY_SHOES';

interface Climate {
  // [min, max] °C per season.
  WINTER: [number, number]; SPRING: [number, number]; SUMMER: [number, number]; AUTUMN: [number, number];
  humid?: boolean;
  /** seasons that are notably rainy/foggy */
  wet?: Season[];
  emoji?: string;
}

// Climate profiles.
const DESERT: Climate = { WINTER: [10, 22], SPRING: [20, 33], SUMMER: [30, 44], AUTUMN: [20, 34], emoji: '☀️' };
const COASTAL_HUMID: Climate = { WINTER: [19, 28], SPRING: [24, 34], SUMMER: [29, 40], AUTUMN: [25, 35], humid: true, emoji: '🌤️' };
const HIGHLAND_MILD: Climate = { WINTER: [6, 18], SPRING: [14, 27], SUMMER: [21, 32], AUTUMN: [13, 26], emoji: '⛅' };
const HIGHLAND_COOL: Climate = { WINTER: [4, 15], SPRING: [11, 22], SUMMER: [16, 26], AUTUMN: [10, 20], wet: ['SUMMER', 'SPRING'], emoji: '🌦️' };
const TEMPERATE: Climate = { WINTER: [2, 10], SPRING: [10, 20], SUMMER: [20, 30], AUTUMN: [9, 19], wet: ['WINTER', 'AUTUMN'], emoji: '🌥️' };
const MEDITERRANEAN: Climate = { WINTER: [6, 14], SPRING: [12, 23], SUMMER: [23, 33], AUTUMN: [14, 24], wet: ['WINTER'], emoji: '🌤️' };

// City name (normalized) -> climate. Covers common SA cities + popular destinations.
const CITY_CLIMATE: Record<string, Climate> = {
  'الرياض': DESERT, 'riyadh': DESERT,
  'العلا': DESERT, 'alula': DESERT, 'al ula': DESERT,
  'المدينة': DESERT, 'المدينه': DESERT, 'medina': DESERT, 'madinah': DESERT,
  'مكة': DESERT, 'مكه': DESERT, 'makkah': DESERT, 'mecca': DESERT,
  'القصيم': DESERT, 'بريدة': DESERT, 'حائل': DESERT, 'تبوك': DESERT,
  'جدة': COASTAL_HUMID, 'جده': COASTAL_HUMID, 'jeddah': COASTAL_HUMID,
  'الدمام': COASTAL_HUMID, 'dammam': COASTAL_HUMID, 'الخبر': COASTAL_HUMID, 'khobar': COASTAL_HUMID,
  'دبي': COASTAL_HUMID, 'dubai': COASTAL_HUMID, 'أبوظبي': COASTAL_HUMID, 'abu dhabi': COASTAL_HUMID,
  'الدوحة': COASTAL_HUMID, 'doha': COASTAL_HUMID, 'المنامة': COASTAL_HUMID, 'الكويت': COASTAL_HUMID,
  'الطايف': HIGHLAND_MILD, 'الطائف': HIGHLAND_MILD, 'taif': HIGHLAND_MILD,
  'أبها': HIGHLAND_COOL, 'ابها': HIGHLAND_COOL, 'abha': HIGHLAND_COOL, 'خميس مشيط': HIGHLAND_COOL,
  'الباحة': HIGHLAND_COOL, 'السودة': HIGHLAND_COOL, 'عسير': HIGHLAND_COOL,
  'إسطنبول': TEMPERATE, 'اسطنبول': TEMPERATE, 'istanbul': TEMPERATE,
  'باريس': TEMPERATE, 'paris': TEMPERATE, 'لندن': TEMPERATE, 'london': TEMPERATE,
  'براغ': TEMPERATE, 'prague': TEMPERATE, 'برلin': TEMPERATE, 'برلين': TEMPERATE, 'berlin': TEMPERATE,
  'روما': MEDITERRANEAN, 'rome': MEDITERRANEAN, 'مدريد': MEDITERRANEAN, 'madrid': MEDITERRANEAN,
  'برشلونة': MEDITERRANEAN, 'barcelona': MEDITERRANEAN, 'أثينا': MEDITERRANEAN, 'athens': MEDITERRANEAN,
  'القاهرة': DESERT, 'cairo': DESERT,
};

export interface WeatherEstimate {
  season: Season;
  tempMin: number;
  tempMax: number;
  condition: Condition;
  humid: boolean;
  wet: boolean;
  emoji: string;
  clothing: Clothing[];
  known: boolean; // whether we recognized the city (else generic temperate)
}

function normalize(city: string): string {
  return city.trim().toLowerCase().replace(/[ً-ْ]/g, ''); // strip Arabic diacritics
}

/** Northern-hemisphere season from a 1–12 month. */
export function seasonOfMonth(month: number): Season {
  if (month === 12 || month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'AUTUMN';
}

function conditionOf(max: number): Condition {
  if (max >= 34) return 'HOT';
  if (max >= 27) return 'WARM';
  if (max >= 18) return 'MILD';
  if (max >= 10) return 'COOL';
  return 'COLD';
}

function clothingFor(min: number, max: number, wet: boolean): Clothing[] {
  const out: Clothing[] = [];
  if (max >= 34) out.push('LIGHT', 'HAT_SUN', 'SUNSCREEN');
  else if (max >= 27) out.push('LIGHT', 'SHORTS', 'SUNSCREEN');
  else if (max >= 18) out.push('LIGHT', 'LIGHT_JACKET');
  else if (max >= 10) out.push('LAYERS', 'JACKET');
  else out.push('COAT', 'LAYERS', 'SCARF');
  if (max - min >= 14 && !out.includes('LAYERS')) out.push('LAYERS'); // big day/night swing
  if (wet) out.push('UMBRELLA');
  out.push('COMFY_SHOES'); // lots of walking on trips
  return out;
}

/** Estimate weather for a city over a date (uses the trip/city start date). */
export function estimateWeather(city: string, isoDate?: string): WeatherEstimate {
  const climate = CITY_CLIMATE[normalize(city)] ?? TEMPERATE;
  const known = normalize(city) in CITY_CLIMATE;
  const d = isoDate ? new Date(isoDate) : new Date();
  const month = Number.isNaN(d.getTime()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  const season = seasonOfMonth(month);
  const [tempMin, tempMax] = climate[season];
  const wet = Boolean(climate.wet?.includes(season));
  return {
    season, tempMin, tempMax,
    condition: conditionOf(tempMax),
    humid: Boolean(climate.humid),
    wet,
    emoji: climate.emoji ?? '🌤️',
    clothing: clothingFor(tempMin, tempMax, wet),
    known,
  };
}
