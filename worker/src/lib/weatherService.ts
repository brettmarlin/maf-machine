// worker/src/lib/weatherService.ts
// Weather data for activity bonuses.
// Uses OpenWeatherMap API (free tier: 1000 calls/day).

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActivityWeather {
  temp_f: number;
  condition: string;          // "rain", "clear", "snow", "clouds", etc.
  condition_code: number;     // OpenWeatherMap condition code
  description: string;        // "light rain", "heavy snow", etc.
}

export interface WeatherBonusInfo {
  rain: boolean;              // condition code 2xx, 3xx, or 5xx
  excessive_heat: boolean;    // temp > 85°F
  cold: boolean;              // temp < 35°F
  temp_f: number;
}

// ─── Weather Fetch ───────────────────────────────────────────────────────────

/**
 * Fetch current weather for an activity's location.
 * Uses OpenWeatherMap "Current Weather" API.
 *
 * Returns null if the API call fails or no API key is provided.
 */
export async function fetchActivityWeather(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<ActivityWeather | null> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=imperial&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as {
      main: { temp: number };
      weather: Array<{ id: number; main: string; description: string }>;
    };

    const weather = data.weather?.[0];
    if (!weather) return null;

    return {
      temp_f: data.main.temp,
      condition: weather.main.toLowerCase(),
      condition_code: weather.id,
      description: weather.description,
    };
  } catch {
    return null;
  }
}

// ─── Bonus Detection ─────────────────────────────────────────────────────────

/**
 * Determine which weather bonuses apply based on conditions.
 */
export function getWeatherBonuses(weather: ActivityWeather): WeatherBonusInfo {
  const code = weather.condition_code;

  // Rain: 2xx (thunderstorm), 3xx (drizzle), 5xx (rain)
  const rain = (code >= 200 && code < 400) || (code >= 500 && code < 600);

  return {
    rain,
    excessive_heat: weather.temp_f > 85,
    cold: weather.temp_f < 35,
    temp_f: weather.temp_f,
  };
}

// ─── Early Bird Detection ────────────────────────────────────────────────────

/**
 * Check if the activity started before 6 AM local time.
 * Uses Strava's start_date_local field (no API needed).
 */
export function isEarlyBird(startDateLocal: string): boolean {
  const hour = new Date(startDateLocal).getHours();
  return hour < 6;
}
