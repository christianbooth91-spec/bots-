// Trench Verified — live leaderboard server.
// Fetches fresh data from the TrenchScore board endpoint on each request (60s in-memory cache)
// and injects it into the page template. No republish step can ever go stale.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const DATA_URL = process.env.BOARD_URL || 'https://qvszlcakxmsptrvrtzay.supabase.co/functions/v1/board?json';
const PORT = process.env.PORT || 3000;

let cache = { at: 0, json: null };

async function getData() {
  if (cache.json && Date.now() - cache.at < 60_000) return cache.json;
  const res = await fetch(DATA_URL, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error('board ' + res.status);
  const text = await res.text();
  JSON.parse(text); // validate
  cache = { at: Date.now(), json: text };
  return text;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
    if (req.url === '/data.json') {
      const j = await getData();
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(j);
    }
    const j = await getData();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' });
    res.end(TEMPLATE.replace('__DATA__', j));
  } catch (e) {
    if (cache.json) { // serve stale on upstream failure
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(TEMPLATE.replace('__DATA__', cache.json));
    }
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('leaderboard temporarily unavailable');
  }
});
server.listen(PORT, () => console.log('trench-verified on :' + PORT));
