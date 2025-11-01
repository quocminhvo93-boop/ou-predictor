import React, { useState } from "react";

export default function OverUnderForm() {
  const [form, setForm] = useState({
    home: "Manchester City",
    away: "Liverpool",
    country: "England",
    league: "Premier League",
    date: "2025-05-10",
    line: 2.5,
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const runPrediction = async () => {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `Giả lập mô phỏng over/under cho trận ${form.home} vs ${form.away} (${form.league}, ${form.country}) vào ngày ${form.date}, kèo ${form.line}`,
            },
          ],
        }),
      });

      const data = await res.json();
      setResult(data.choices?.[0]?.message?.content || "Không có kết quả");
    } catch (err) {
      setResult("Lỗi kết nối hoặc không thể chạy mô phỏng.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-white shadow rounded-2xl mt-6">
      <h2 className="text-xl font-semibold mb-4 text-center">
        ⚽ Over/Under Predictor (Web Mini)
      </h2>
      <div className="grid gap-3">
        <input name="home" value={form.home} onChange={handleChange} placeholder="Home team" className="border p-2 rounded" />
        <input name="away" value={form.away} onChange={handleChange} placeholder="Away team" className="border p-2 rounded" />
        <input name="country" value={form.country} onChange={handleChange} placeholder="Country" className="border p-2 rounded" />
        <input name="league" value={form.league} onChange={handleChange} placeholder="League" className="border p-2 rounded" />
        <input name="date" type="date" value={form.date} onChange={handleChange} className="border p-2 rounded" />
        <input name="line" type="number" step="0.25" value={form.line} onChange={handleChange} className="border p-2 rounded" />

        <button
          onClick={runPrediction}
          disabled={loading}
          className="bg-blue-600 text-white rounded-xl p-2 hover:bg-blue-700"
        >
          {loading ? "Đang mô phỏng..." : "Chạy mô phỏng"}
        </button>
      </div>

      {result && (
        <div className="mt-4 bg-gray-50 border p-3 rounded">
          <p className="whitespace-pre-wrap text-sm">{result}</p>
        </div>
      )}
    </div>
  );
}
