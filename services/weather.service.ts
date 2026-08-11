/**
 * Weather → climate context for design sessions (guide §8A: `{ temperature_c, humidity }`).
 * Uses Open-Meteo directly from the client (no backend call).
 */

export type CurrentWeather = {
    temperature_c: number;
    humidity: number;
    weatherCode: number;
};

export async function getClimate(latitude: number, longitude: number): Promise<CurrentWeather | null> {
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
                `&current=temperature_2m,relative_humidity_2m,weather_code`,
        );
        const data = await res.json();
        const c = data?.current;
        if (!c) return null;
        return {
            temperature_c: Math.round(c.temperature_2m),
            humidity: Math.round(c.relative_humidity_2m),
            weatherCode: c.weather_code,
        };
    } catch {
        return null; // climate is optional context — never fail the scan over it
    }
}

// Back-compat with the previous shape used elsewhere in the app.
export async function getWeather(latitude: number, longitude: number) {
    const climate = await getClimate(latitude, longitude);
    if (!climate) return null;
    return { temperature: climate.temperature_c, weathercode: climate.weatherCode };
}
