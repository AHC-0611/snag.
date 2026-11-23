// Vercel serverless function: GET /api/search?q=quarter+zip&min=0&max=50
// Searches three live sources in parallel through SerpAPI and merges them:
//   1. Google Shopping: big retailers + brand stores
//   2. eBay: resale and hard-to-find items
//   3. Resale sites (StockX, GOAT, Stadium Goods, Flight Club, Grailed): limited / streetwear drops
// Set SERPAPI_KEY in Vercel → Project → Settings → Environment Variables.
// Each search uses up to 3 SerpAPI credits (results are cached 10 min at Vercel's edge).

const RESALE_SITES = {
  "stockx.com": "StockX",
  "goat.com": "GOAT",
  "stadiumgoods.com": "Stadium Goods",
  "flightclub.com": "Flight Club",
  "grailed.com": "Grailed",
};

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
  const inRange = (p) => p != null && (min == null || p >= min) && (max == null || p <= max);

  const [shop, ebay, resale] = await Promise.allSettled([
    googleShopping(q, min, max, key),
    ebaySearch(q, min, max, key),
    resaleSearch(q, key),
  ]);

  const sources = {};
  const all = [];
  for (const [name, r] of [["Google Shopping", shop], ["eBay", ebay], ["Resale sites", resale]]) {
    if (r.status === "fulfilled") {
      const items = r.value.filter((i) => inRange(i.price) && i.link);
      sources[name] = items.length;
      all.push(...items);
    } else {
      sources[name] = 0;
    }
  }

  if (all.length === 0 && [shop, ebay, resale].every((r) => r.status === "rejected")) {
    return res.status(502).json({ error: "upstream", message: String(shop.reason?.message || "Search provider error") });
  }

  // De-dupe
  const seen = new Set();
  const items = all.filter((i) => {
    const k = `${i.title.toLowerCase()}|${i.store.toLowerCase()}|${i.price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
  return res.status(200).json({ query: q, count: items.length, sources, fetchedAt: new Date().toISOString(), items });
}

/* ---------------- Sources ---------------- */

async function serp(params, key) {
  const r = await fetch(`https://serpapi.com/search.json?${new URLSearchParams({ ...params, api_key: key })}`);
  const data = await r.json();
  if (!r.ok || data.error) {
    // "no results" isn't a failure
    if (/hasn't returned any results|no results/i.test(data.error || "")) return {};
    throw new Error(data.error || `Search provider returned ${r.status}`);
  }
  return data;
}

async function googleShopping(q, min, max, key) {
  const params = { engine: "google_shopping", q, gl: "us", hl: "en", num: "100" };
  if (min != null) params.min_price = String(Math.floor(min));
  if (max != null) params.max_price = String(Math.ceil(max));
  const data = await serp(params, key);
  const raw = [...(data.shopping_results || []), ...(data.inline_shopping_results || [])];
  return raw.map((it) => {
    const price = it.extracted_price ?? parsePrice(it.price);
    const oldPrice = it.extracted_old_price ?? parsePrice(it.old_price);
    return {
      id: "g-" + (it.product_id || it.position || it.title),
      source: "Google Shopping",
      title: it.title || "Untitled",
      store: it.source || "Unknown store",
      price,
      oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null,
      rating: typeof it.rating === "number" ? it.rating : null,
      reviews: typeof it.reviews === "number" ? it.reviews : null,
      thumbnail: it.thumbnail || it.serpapi_thumbnail || null,
      link: it.link || it.product_link,
      reviewsLink: it.product_link || it.link,
      delivery: it.delivery || (Array.isArray(it.extensions) ? it.extensions.find((e) => /deliver|shipping/i.test(e)) : null) || null,
      condition: it.second_hand_condition || null,
    };
  });
}

async function ebaySearch(q, min, max, key) {
  const params = { engine: "ebay", _nkw: q, ebay_domain: "ebay.com" };
  if (min != null) params._udlo = String(Math.floor(min));
  if (max != null) params._udhi = String(Math.ceil(max));
  const data = await serp(params, key);
  return (data.organic_results || [])
    .filter((it) => it.title && !/^shop on ebay$/i.test(it.title))
    .map((it, n) => {
      const p = it.price || {};
      const price = p.extracted ?? p.from?.extracted ?? parsePrice(p.raw ?? p.from?.raw ?? it.price);
      const ship = typeof it.shipping === "string" ? it.shipping : it.shipping?.raw || null;
      return {
        id: "e-" + (it.product_id || it.link || n),
        source: "eBay",
        title: it.title,
        store: "eBay",
        price,
        oldPrice: null,
        rating: typeof it.rating === "number" ? it.rating : null,
        reviews: typeof it.reviews === "number" ? it.reviews : null,
        thumbnail: it.thumbnail || null,
        link: it.link,
        reviewsLink: it.link,
        delivery: ship && /free/i.test(ship) ? "Free delivery" : ship,
        condition: it.condition || null,
      };
    });
}

async function resaleSearch(q, key) {
  const sites = Object.keys(RESALE_SITES).map((d) => `site:${d}`).join(" OR ");
  const data = await serp({ engine: "google", q: `${q} (${sites})`, gl: "us", hl: "en", num: "40" }, key);
  return (data.organic_results || [])
    .map((it, n) => {
      const host = hostOf(it.link);
      const store = Object.entries(RESALE_SITES).find(([d]) => host.endsWith(d))?.[1];
      if (!store) return null;
      const price = findPrice(it.rich_snippet) ?? parsePrice(matchDollar(it.snippet)) ?? parsePrice(matchDollar(it.title));
      return {
        id: "r-" + (it.link || n),
        source: "Resale sites",
        title: cleanTitle(it.title, store),
        store,
        price,
        oldPrice: null,
        rating: null,
        reviews: null,
        thumbnail: it.thumbnail || it.favicon || null,
        link: it.link,
        reviewsLink: it.link,
        delivery: null,
        condition: store === "Grailed" ? "Pre-owned" : null,
      };
    })
    .filter(Boolean);
}

/* ---------------- Helpers ---------------- */

function toNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePrice(s) {
  if (s == null) return null;
  if (typeof s === "number") return s;
  const m = String(s).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function matchDollar(s) {
  const m = String(s || "").match(/\$\s?\d[\d,]*(?:\.\d{2})?/);
  return m ? m[0] : null;
}

function findPrice(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (/price/i.test(k)) {
      const p = parsePrice(typeof v === "object" ? null : v);
      if (p) return p;
    }
    if (typeof v === "object") {
      const p = findPrice(v, depth + 1);
      if (p) return p;
    }
  }
  return null;
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function cleanTitle(t, store) {
  return String(t || "Untitled")
    .replace(new RegExp(`\\s*[|\\-–]\\s*${store}.*$`, "i"), "")
    .replace(/\s*[|\-–]\s*(Buy|Sell|Shop).*$/i, "")
    .trim();
}
