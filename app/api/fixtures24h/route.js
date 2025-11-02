// app/api/fixtures24h/route.js
// Liệt kê các trận trong 24h tới cho các giải châu Âu (tier 1–3)
// Tự tra leagueId bằng country + league name (không cần hardcode id)

const LEAGUES_EU = [
  // --- Anh ---
  { country: "England", league: "Premier League",   sport: "soccer_epl" },
  { country: "England", league: "Championship",     sport: null },
  { country: "England", league: "League One",       sport: null },

  // --- Scotland ---
  { country: "Scotland", league: "Premiership",     sport: "soccer_scotland_premiership" },
  { country: "Scotland", league: "Championship",    sport: null },
  { country: "Scotland", league: "League One",      sport: null },

  // --- Spain ---
  { country: "Spain",    league: "La Liga",         sport: "soccer_spain_la_liga" },
  { country: "Spain",    league: "La Liga 2",       sport: null },

  // --- Italy ---
  { country: "Italy",    league: "Serie A",         sport: "soccer_italy_serie_a" },
  { country: "Italy",    league: "Serie B",         sport: null },

  // --- Germany ---
  { country: "Germany",  league: "Bundesliga",      sport: "soccer_germany_bundesliga" },
  { country: "Germany",  league: "2. Bundesliga",   sport: null },
  { country: "Germany",  league: "3. Liga",         sport: null },

  // --- France ---
  { country: "France",   league: "Ligue 1",         sport: "soccer_france_ligue_one" },
  { country: "France",   league: "Ligue 2",         sport: null },

  // --- Netherlands ---
  { country: "Netherlands", league: "Eredivisie",      sport: "soccer_netherlands_eredivisie" },
  { country: "Netherlands", league: "Eerste Divisie",  sport: null },

  // --- Portugal ---
  { country: "Portugal", league: "Primeira Liga",   sport: "soccer_portugal_primeira_liga" },
  { country: "Portugal", league: "Liga Portugal 2", sport: null },

  // --- Turkey ---
  { country: "Turkey",   league: "Super Lig",       sport: "soccer_turkey_super_lig" },

  // --- Austria (Áo) ---
  { country: "Austria",  league: "Bundesliga",      sport: "soccer_austria_bundesliga" },
  { country: "Austria",  league: "2. Liga",         sport: null },

  // --- Switzerland (Thụy Sĩ) ---
  { country: "Switzerland", league: "Super League",   sport: "soccer_switzerland_superleague" },
  { country: "Switzerland", league: "Challenge League", sport: null },

  // --- Sweden (Thụy Điển) ---
  { country: "Sweden",   league: "Allsvenskan",     sport: "soccer_sweden_allsvenskan" },
  { country: "Sweden",   league: "Superettan",      sport: null },

  // --- Hungary (Hungary) ---
  { country: "Hungary",  league: "NB I",            sport: null },
  { country: "Hungary",  league: "NB II",           sport: null },

  // --- Bulgaria (Bulgary) ---
  { country: "Bulgaria", league: "First League",    sport: null },
  { country: "Bulgaria", league: "Second League",   sport: null },
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

// Tra leagueId qua country + league name; ưu tiên current=true
async function resolveLeagueId(country, league) {
  // Thử current=true trước
  let js = await afGet("/leagues", { country, name: league, current: true });
  if (js?.response?.length) return js.response[0].league.id;
  // Rộng hơn (không current)
  js = await afGet("/leagues", { country, name: league });
  return js?.response?.[0]?.league?.id || null;
}

// yyyy-mm-dd từ UTC date
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

    // Cache resolve id trong 1 request để giảm call
    const idCache = new Map();
    async function getLeagueId(c, l) {
      const key = `${c}|${l}`;
      if (idCache.has(key)) return idCache.get(key);
      const id = await resolveLeagueId(c, l);
      idCache.set(key, id);
      return id;
    }

    const all = [];
    for (const lg of LEAGUES_EU) {
      try {
        const id = await getLeagueId(lg.country, lg.league);
        if (!id) continue; // bỏ giải không resolve được id
        const js = await afGet("/fixtures", {
          league: id,
          from: fromISO,
          to: toISO,
          timezone: "UTC",
        });
        for (const f of js?.response || []) {
          all.push({
            leagueId: id,
            league: lg.league,
            country: lg.country,
            sport: lg.sport,               // để UI quyết định lấy odds
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

    // sắp xếp theo giờ đá
    all.sort((a,b) => new Date(a.dateUTC) - new Date(b.dateUTC));
    return Response.json({ ok: true, count: all.length, fixtures: all.slice(0, 80) });
  } catch (e) {
    return Response.json({ ok:false, error: String(e) }, { status: 500 });
  }
}
