module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      ok: false,
      error: 'Missing GEMINI_API_KEY',
      setup: 'Set GEMINI_API_KEY in your deployment environment variables',
    });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const day = body.day || 'Monday';
    const mess = body.mess || 'north';
    const target = body.target || { calories: 2200, protein: 110 };
    const menu = body.menu || {};

    const prompt = [
      'You are a nutrition planner for Indian hostel food.',
      'Create a practical one-day plan based only on the provided menu items.',
      'Return STRICT JSON with this shape only:',
      '{"note":"...","meals":{"breakfast":[{"name":"","calories":0,"protein":0}],"lunch":[...],"snacks":[...],"dinner":[...]}}',
      'Rules:',
      '- calories and protein must be integers.',
      '- include 2 to 5 items per meal using menu words where possible.',
      '- keep full-day total near targets, prioritize protein adequacy.',
      '- no markdown, no explanation, only JSON.',
      `Day: ${day}`,
      `Mess: ${mess}`,
      `Target calories: ${target.calories}`,
      `Target protein: ${target.protein}`,
      `Menu JSON: ${JSON.stringify(menu)}`,
    ].join('\n');

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1200,
          },
        }),
      }
    );

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      res.status(502).json({ ok: false, error: 'Gemini request failed', details: errText.slice(0, 400) });
      return;
    }

    const data = await geminiResp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

    res.status(200).json({ ok: true, text });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Server error', details: String(error.message || error) });
  }
};
