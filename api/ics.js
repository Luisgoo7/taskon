// Função da Vercel: busca a agenda (.ics) para o app, que sozinho seria
// bloqueado pelo CORS do Google/Outlook. Faz o mesmo que o server.py no PC.
const ALLOWED_HOSTS = [
  /(^|\.)calendar\.google\.com$/,
  /(^|\.)outlook\.(office365|live)\.com$/,
  /(^|\.)icloud\.com$/,
];
const MAX_SIZE = 10_000_000; // 10 MB

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    let url = String(req.body?.url || '').trim();
    if (url.startsWith('webcal://')) url = `https://${url.slice('webcal://'.length)}`;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Link inválido');
    }
    // Só agendas conhecidas: evita que a função vire um proxy aberto
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(parsed.hostname))) {
      throw new Error('Use um link iCal do Google Agenda, Outlook ou iCloud');
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'TaskON/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`A agenda respondeu com erro ${response.status}`);

    const body = await response.text();
    if (body.length > MAX_SIZE) throw new Error('Agenda grande demais');
    if (!body.replace(/^﻿/, '').trimStart().startsWith('BEGIN:VCALENDAR')) {
      throw new Error('Esse link não é de uma agenda iCal (.ics)');
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(body);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
};
