async function apiGet(path, params = {}) {
  const base = "https://v3.football.api-sports.io";
  const url = new URL(path, base);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url, { headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }, cache: "no-store" });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}
async function teamIdByName(name) {
  const js = await apiGet("/teams", { search: name });
  return js?.response?.[0]?.team?.id || null;
}
async function lastNStats(teamId, n = 10) {
  const js = await apiGet("/fixtures", { team: teamId, last: n });
  let gf = 0, ga = 0, cnt = 0;
  for (const f of js?.response || []) {
    const home = f?.teams?.home?.id === teamId;
    const goalsFor = home ? f?.goals?.home : f?.goals?.away;
    const goalsAg  = home ? f?.goals?.away : f?.goals?.home;
    if (Number.isFinite(goalsFor) && Number.isFinite(goalsAg)) { gf += goalsFor; ga += goalsAg; cnt++; }
  }
  return cnt ? { gf: gf / cnt, ga: ga / cnt, count: cnt } : { gf: 1.2, ga: 1.2, count: 0 };
}
export async function GET(req) {
  try {
    if (!process.env.API_FOOTBALL_KEY) return Response.json({ error: "Missing API_FOOTBALL_KEY" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const home = searchParams.get("home"); const away = searchParams.get("away");
    if (!home || !away) return Response.json({ error: "home & away required" }, { status: 400 });
    const [homeId, awayId] = await Promise.all([teamIdByName(home), teamIdByName(away)]);
    const [h, a] = await Promise.all([lastNStats(homeId), lastNStats(awayId)]);
    const leagueAvg = 1.30;
    const lambda_home = Math.max(0.05, Math.min(5, (h.gf * a.ga) / leagueAvg));
    const lambda_away = Math.max(0.05, Math.min(5, (a.gf * h.ga) / leagueAvg));
    return Response.json({ source: "api-football", home, away, homeId, awayId, last10: { home: h, away: a }, lambda: { home: lambda_home, away: lambda_away } });
  } catch (e) { return Response.json({ error: String(e) }, { status: 500 }); }
}
