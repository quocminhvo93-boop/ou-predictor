export async function POST(req) {
  try {
    const { home, away, country, league, date, line } = await req.json();

    const prompt = `Hãy đưa ra dự đoán xác suất Over/Under cho trận:
- Home: ${home}
- Away: ${away}
- League: ${league}
- Country: ${country}
- Date: ${date}
- Line: ${line}
Trả kết quả ngắn gọn, gồm P(Over), P(Under) và gợi ý nếu có.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Bạn là trợ lý dự đoán O/U, trả lời ngắn gọn, rõ ràng." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await resp.json();
    const result = data?.choices?.[0]?.message?.content ?? "Không có kết quả";
    return Response.json({ result });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
