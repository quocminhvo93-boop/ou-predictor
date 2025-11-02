// app/api/fixtures24h/route.js
// Trả về danh sách trận trong 24h tới cho các giải châu Âu (tier 1–3)

const EU_LEAGUES = [
  // England
  { country: "England", league: "Premier League", id: 39, sport: "soccer_epl" },
  { country: "England", league: "Championship",  id: 40, sport: null },
  { country: "England", league: "League One",    id: 41, sport: null },
  // Spain
  { country: "Spain",   league: "La Liga",       id: 140, sport: "soccer_spain_la_liga" },
  { country: "Spain",   league: "La Liga 2",     id: 141, sport: null },
  // Italy
  { country: "Italy",   league: "Serie A",       id: 135, sport: "soccer_italy_serie_a" },
  { country: "Italy",   league: "Serie B",       id: 136, sport: null },
  // Germany
  { country: "Germany", league: "Bundesliga",    id: 78,  sport: "soccer_germany_bundesliga" },
  { country: "Germany", league: "2. Bundesliga", id: 79,  sport: null },
  { country: "Germany", league: "3. Liga",       id: 195, sport: null },
  // France
  { country: "France",  league: "Ligue 1",       id: 61,  sport: "soccer_france_ligue_one" },
  { country: "France",  league: "Ligue 2",       id: 62,  sport: null },
  // Netherlands
  { country: "Netherlands", league: "Eredivisie",    id: 88, sport: "soccer_netherlands_eredivisie" },
  { country: "Netherlands", league: "Eerste Divisie",id: 90, sport: null },
  // Portugal
  { country: "Portugal", league: "Primeira Liga", id: 94,  sport: "soccer_portugal_primeira_liga" },
  { country: "Portugal", league: "Liga Portugal 2", id: 95,  sport: null },
  // Turkey
  { country: "Turkey",   league: "Super Lig",     id: 203, sport: "soccer_turkey_super_lig" },
];

async function afGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url  = new URL(path, base);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }, cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j;
}
function toUTCDateISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  try {
    if (!process.env.API_FOOTBALL_KEY) {
      return Response.json({ ok:false, error: "Missing API_FOOTBALL_KEY" }, { status: 500 });
    }
    const now = new Date();
    const in24 = new Date(now.getTime() + 24*60*60*1000);
    const fromISO = toUTCDateISO(now);
    const toISO   = toUTCDateISO(in24);

    const all = [];
    for (const lg of EU_LEAGUES) {
      try {
        const js = await afGet("/fixtures", { league: lg.id, from: fromISO, to: toISO, timezone: "UTC" });
        for (const f of js?.response || []) {
          all.push({
            leagueId: lg.id,
            league: lg.league,
            country: lg.country,
            sport: lg.sport,
            fixtureId: f.fixture.id,
            dateUTC: f.fixture.date,
            home: f.teams?.home?.name,
            away: f.teams?.away?.name,
            status: f.fixture?.status?.short,
            venue: f.fixture?.venue?.name || null,
          });
        }
      } catch {}
    }
    all.sort((a,b) => new Date(a.dateUTC) - new Date(b.dateUTC));
    return Response.json({ ok: true, count: all.length, fixtures: all.slice(0,50) });
  } catch (e) {
    return Response.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
