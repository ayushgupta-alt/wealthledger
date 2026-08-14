// netlify/functions/stock-quote.js
//
// Runs server-side on Netlify's infrastructure, not in the visitor's browser.
// That's the entire point: Yahoo Finance blocks/behaves inconsistently for
// direct browser calls (CORS + bot detection), but has no problem with a
// plain server-to-server request carrying a normal browser User-Agent.
//
// Because this deploys under the SAME domain as the rest of Wealth Ledger,
// the app calling it is a same-origin request — no CORS negotiation needed
// at all, no public proxy in the middle, no mixed-content issue. This is
// the reliable fix; everything before this was working around not having it.
//
// Called as: /api/stock-quote?symbol=RELIANCE.NS

export default async (req) => {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');

  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Missing "symbol" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const yahooRes = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      {
        headers: {
          // Yahoo's edge tends to reject requests with no browser-like User-Agent —
          // this alone fixes a good chunk of the failures a bare server fetch would hit.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
        }
      }
    );

    if (!yahooRes.ok) {
      return new Response(JSON.stringify({ error: `Yahoo returned HTTP ${yahooRes.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await yahooRes.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const asOf = data?.chart?.result?.[0]?.meta?.regularMarketTime;

    if (typeof price !== 'number') {
      return new Response(JSON.stringify({ error: `No price found for "${symbol}" — check the ticker (e.g. RELIANCE.NS, TCS.NS)` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ symbol, price, asOf: asOf || null }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Short cache so refreshing several assets back-to-back doesn't hammer Yahoo
        // for a symbol you just fetched seconds ago, without ever serving stale data.
        'Cache-Control': 'public, max-age=30'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e && e.message ? e.message : 'Fetch to Yahoo failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/stock-quote' };
