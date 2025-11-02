export async function GET() {
  return Response.json({
    api_football: !!process.env.API_FOOTBALL_KEY,
    odds_api:     !!process.env.ODDS_API_KEY,
    openweather:  !!process.env.OPENWEATHER_KEY,
    project: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "unknown"
  });
}
