// Vercel serverless function: GET /api/search?q=quarter+zip&min=0&max=50
// Pulls live Google Shopping results (every major store + brand) through SerpAPI.
// Set SERPAPI_KEY in Vercel → Project → Settings → Environment Variables.

export default async function handler(req, res) {
  const key = process.env.SERPAPI_KEY;
  if (!key) {
    return res.status(500).json({
      error: "missing_key",
      message: "Add your SERPAPI_KEY in Vercel → Settings → Environment Variables, then redeploy.",
    });
  }

  const q = String(req.query.q || "").trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: "missing_query", message: "Type something to search for." });

  const min = toNum(req.query.min);
  const max = toNum(req.query.max);

  const params = new URLSearchParams({
    engine: "google_shopping",
    q,
    gl: "us",
    hl: "en",
    num: "100",
    api_key: key,
  });
  if (min != null) params.set("min_price", String(Math.floor(min)));
  if (max != null) params.set("max_price", String(Math.ceil(max)));
  if (req.query.sale === "1") params.set("on_sale", "true");

  try {
    const r = await fetch(`https://serpapi.com/search.json?${params}`);
    const data = await r.json();
    if (!r.ok || data.error) {
      return res.status(502).json({ error: "upstream", message: data.error || `Search provider returned ${r.status}` });
    }

    const raw = [...(data.shopping_results || []), ...(data.inline_shopping_results || [])];
    const seen = new Set();
    const items = [];
    for (const it of raw) {
      const price = it.extracted_price ?? parsePrice(it.price);
      if (price == null) continue;
      // Safety net in case the provider ignored the price filter
      if (min != null && price < min) continue;
      if (max != null && price > max) continue;
      const link = it.link || it.product_link;
      if (!link) continue;
      const dedupe = `${(it.title || "").toLowerCase()}|${(it.source || "").toLowerCase()}|${price}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const oldPrice = it.extracted_old_price ?? parsePrice(it.old_price);
      items.push({
        id: it.product_id || it.position || dedupe,
        title: it.title || "Untitled",
        store: it.source || "Unknown store",
        price,
        oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
        rating: typeof it.rating === "number" ? it.rating : null,
        reviews: typeof it.reviews === "number" ? it.reviews : null,
        thumbnail: it.thumbnail || it.serpapi_thumbnail || null,
        link,
        reviewsLink: it.product_link || link,
        delivery: it.delivery || (Array.isArray(it.extensions) ? it.extensions.find((e) => /deliver|shipping/i.test(e)) : null) || null,
        tag: it.tag || null,
      });
    }

    // Cache at Vercel's edge for 10 min so repeat searches don't burn API credits
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({ query: q, count: items.length, fetchedAt: new Date().toISOString(), items });
  } catch (e) {
    return res.status(500).json({ error: "network", message: "Couldn't reach the search provider. Try again." });
  }
}

function toNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePrice(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
