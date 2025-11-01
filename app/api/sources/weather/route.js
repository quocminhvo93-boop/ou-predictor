async function getJSON(url, params) {
  const u = new URL(url);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
}
export async function GET(req) {
  try {
    if (!process.env.OPENWEATHER_KEY) return Response.json({ error: "Missing OPENWEATHER_KEY" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city"); const country = searchParams.get("country");
    if (!city) return Response.json({ error: "city required" }, { status: 400 });

    const geo = await getJSON("http://api.openweathermap.org/geo/1.0/direct", { q: country ? `${city},${country}` : city, limit: 1, appid: process.env.OPENWEATHER_KEY });
    if (!Array.isArray(geo) || !geo[0]) return Response.json({ error: "geocode not found" }, { status: 404 });

    const { lat, lon } = geo[0];
    const w = await getJSON("https://api.openweathermap.org/data/2.5/weather", { lat, lon, units: "metric", appid: process.env.OPENWEATHER_KEY });

    const weather = (w?.weather?.[0]?.main || "").toLowerCase();
    const wind = Number(w?.wind?.speed || 0);
    const temp = Number(w?.main?.temp || 15);
    let impact = 1.0;
    if (weather.includes("rain") || weather.includes("snow")) impact *= 0.95;
    if (wind >= 12) impact *= 0.9; else if (wind >= 8) impact *= 0.95;
    if (temp <= 0 || temp >= 30) impact *= 0.97;

    return Response.json({ source: "openweather", city, country, weather: w, impact });
  } catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
