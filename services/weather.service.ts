export async function getWeather(latitude: number, longitude: number) {
    const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
    );

    const data = await res.json();

    return data.current_weather;
}