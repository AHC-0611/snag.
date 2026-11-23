/* Snag — front end */

const BRANDS = [
  "Nike", "Adidas", "Under Armour", "Puma", "New Balance", "Reebok", "Champion", "Lululemon", "Vuori", "Gymshark",
  "Patagonia", "The North Face", "Columbia", "Arc'teryx", "Carhartt", "L.L.Bean", "Eddie Bauer", "Marmot", "Helly Hansen", "Fjallraven",
  "Ralph Lauren", "Polo", "Tommy Hilfiger", "Calvin Klein", "Lacoste", "Nautica", "Vineyard Vines", "Brooks Brothers", "Hugo Boss",
  "Levi's", "Wrangler", "Lee", "J.Crew", "Banana Republic", "Gap", "Old Navy", "Abercrombie", "Hollister", "American Eagle",
  "Uniqlo", "H&M", "Zara", "Express", "Amazon Essentials", "Hanes", "Fruit of the Loom", "Dickies", "Timberland",
  "Essentials", "Stussy", "Converse", "Vans", "Quiksilver", "Billabong", "Free People", "Madewell", "Aerie", "Athleta", "Alo",
];

/* ---------- Seller trust ---------- */
// Authorized / major retailers that buy stock straight from the brands
const AUTHORIZED = [
  "amazon.com", "nordstrom", "nordstrom rack", "macy's", "kohl's", "dick's sporting goods", "jcpenney", "target", "zappos", "rei",
  "foot locker", "champs sports", "finish line", "jd sports", "academy sports", "scheels", "bloomingdale's", "saks fifth avenue", "saks off 5th",
  "neiman marcus", "dillard's", "belk", "backcountry", "moosejaw", "evo", "urban outfitters", "pacsun", "zumiez", "ssense", "end.", "farfetch",
  "mr porter", "mytheresa", "revolve", "shopbop", "lids", "fanatics", "uniqlo", "gap", "old navy", "banana republic", "h&m", "zara", "j.crew",
  "abercrombie & fitch", "hollister", "american eagle", "aerie", "express", "l.l.bean", "eddie bauer", "lululemon", "athleta", "vuori", "alo yoga",
  "sierra", "tj maxx", "marshalls", "burlington", "ross", "dsw", "famous footwear", "hibbett", "eastern mountain sports", "sun & ski", "cabela's",
  "bass pro shops", "walmart", "costco", "sam's club", "kohls", "macys", "levi's", "carhartt", "columbia sportswear", "the north face",
  "patagonia", "under armour", "adidas", "nike", "puma", "new balance", "reebok", "champion", "ralph lauren", "tommy hilfiger", "calvin klein",
];
// Resale sites that inspect items before shipping
const AUTH_RESALE = ["stockx", "goat", "the realreal", "flight club", "stadium goods", "vestiaire collective", "rebag", "fashionphile"];
// Obvious counterfeit wording: always hidden, in every mode
const FAKE_WORDS = /\b(replicas?|reps|1:1|fake|knock-?offs?|mirror quality|aaa\+? quality|unbranded copy)\b/i;

function trustOf(store, title) {
  const s = String(store || "").toLowerCase().trim();
  if (FAKE_WORDS.test(title || "")) return { tier: "fake", label: "Likely counterfeit" };
  // Marketplace third-party sellers show up like "Walmart - SellerName" or "Amazon.com - Seller"
  if (/ - /.test(s) || /\bebay\b|poshmark|depop|mercari|dhgate|aliexpress|temu|shein|wish|alibaba|etsy|facebook/.test(s)) {
    return { tier: "unverified", label: "Marketplace seller" };
  }
  if (s === "grailed") return { tier: "unverified", label: "Resale marketplace" };
  if (AUTH_RESALE.some((r) => s === r || s.startsWith(r))) return { tier: "resale", label: "Authenticated resale" };
  const brand = detectBrand(s);
  if (brand && s.replace(/\.com$/, "").replace(/['’]/g, "'").length <= brand.length + 6) return { tier: "official", label: "Official store" };
  if (AUTHORIZED.some((r) => s === r || s === r + ".com")) return { tier: "authorized", label: "Authorized retailer" };
  return { tier: "unverified", label: "Unverified seller" };
}

/* ---------- Main sellers (pick before or after searching) ---------- */
const SELLERS = [
  { id: "official", label: "Brand stores", test: (i) => i.trust && i.trust.tier === "official" },
  { id: "amazon", label: "Amazon", re: /^amazon\.com/ },
  { id: "walmart", label: "Walmart", re: /^walmart/ },
  { id: "target", label: "Target", re: /^target/ },
  { id: "nordstrom", label: "Nordstrom", re: /^nordstrom/ },
  { id: "macys", label: "Macy's", re: /^macy/ },
  { id: "kohls", label: "Kohl's", re: /^kohl/ },
  { id: "dicks", label: "Dick's", re: /^dick'?s/ },
  { id: "footlocker", label: "Foot Locker", re: /foot locker|champs sports/ },
  { id: "jcpenney", label: "JCPenney", re: /^jcpenney/ },
  { id: "rei", label: "REI", re: /^rei(\b|$)/ },
  { id: "stockx", label: "StockX", re: /^stockx/ },
  { id: "goat", label: "GOAT", re: /^goat/ },
  { id: "stadium", label: "Stadium Goods", re: /^stadium goods/ },
  { id: "ebay", label: "eBay", re: /^ebay/, marketplace: true },
  { id: "grailed", label: "Grailed", re: /^grailed/, marketplace: true },
];
function matchesSeller(item, ids) {
  if (!ids.size) return true;
  const s = String(item.store || "").toLowerCase().replace(/[’]/g, "'");
  return SELLERS.some((o) => ids.has(o.id) && (o.test ? o.test(item) : o.re.test(s)));
}

const state = {
  query: "",
  items: [],
  min: null,
  max: null,
  minRating: 0,
  saleOnly: false,
  ratedOnly: false,
  freeShip: false,
  brands: new Set(),
  sellers: new Set(),
  stores: new Set(),
  sort: "score",
  authenticOnly: true,
  brandFilterText: "",
  showingSaved: false,
};

/* ---------- Prompt parsing ("best quarter zip under $50") ---------- */
function parsePrompt(text) {
  let t = " " + String(text).toLowerCase().replace(/[’']/g, "'") + " ";
  let min = null, max = null, sort = null;
  const N = "\\$?\\s*(\\d+(?:\\.\\d{1,2})?)\\s*(?:k\\b)?\\s*(?:dolla\\w*|bucks|usd|\\$)?";
  const take = (re, fn) => {
    const m = t.match(re);
    if (m) { fn(m); t = t.replace(m[0], " "); return true; }
    return false;
  };

  take(new RegExp("between\\s+" + N + "\\s+(?:and|to|-)\\s+" + N), (m) => { min = +m[1]; max = +m[2]; }) ||
  take(new RegExp("(?:from\\s+)?\\$\\s*(\\d+)\\s*(?:-|to)\\s*\\$?\\s*(\\d+)"), (m) => { min = +m[1]; max = +m[2]; }) ||
  take(new RegExp("(\\d+)\\s*(?:-|to)\\s*(\\d+)\\s*(?:dolla\\w*|bucks|usd)"), (m) => { min = +m[1]; max = +m[2]; });

  if (max == null) take(new RegExp("(?:under|below|less than|cheaper than|no more than|not more than|max(?:imum)?|up to|at most|within|<)\\s*(?:of\\s+)?" + N), (m) => { max = +m[1]; });
  if (min == null) take(new RegExp("(?:over|above|more than|at least|min(?:imum)?|starting at|>)\\s*" + N), (m) => { min = +m[1]; });
  if (min != null && max != null && min > max) [min, max] = [max, min];

  if (/\b(cheapest|lowest price|least expensive)\b/.test(t)) sort = "price_asc";
  else if (/\b(top rated|highest rated|best rated|best reviewed|best reviews)\b/.test(t)) sort = "rating";
  else if (/\b(biggest discount|most off|on sale|clearance)\b/.test(t)) sort = "discount";
  const saleOnly = /\b(on sale|clearance)\b/.test(t);

  const filler = [
    "find me", "find my", "find mt", "find", "show me", "get me", "search for", "search", "look for", "looking for", "i'm looking for", "im looking for",
    "i want", "i need", "can you", "could you", "please", "help me", "give me", "recommend", "what's", "what is", "whats",
    "cheapest", "lowest price", "least expensive", "top rated", "highest rated", "best rated", "best reviewed", "best reviews", "biggest discount", "most off",
    "on sale", "clearance", "the best", "best", "top", "good", "great", "nice", "cheap", "affordable", "budget", "deals on", "deals", "deal",
    "some", "any", "a", "an", "the", "price", "priced", "for under", "dollars", "dollar", "bucks", "with good reviews", "good reviews", "reviews",
  ].sort((a, b) => b.length - a.length);
  for (const f of filler) {
    t = t.replace(new RegExp("(^|\\s)" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s|$)", "g"), " ");
  }
  let query = t.replace(/[?!.,]/g, " ").replace(/\s+(for|on|of|that|is|are|with|and)\s*$/g, " ").replace(/^\s*(for|on|of|a)\s+/, " ").replace(/\s+/g, " ").trim();
  if (!query) query = String(text).trim();
  return { query, min, max, sort, saleOnly };
}

/* ---------- Scoring ---------- */
function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function scoreItems(items) {
  const med = median(items.map((i) => i.price)) || 1;
  return items.map((it) => {
    const discountPct = it.oldPrice ? Math.round((1 - it.price / it.oldPrice) * 100) : 0;
    const ratingQ = it.rating != null ? clamp((it.rating - 3) / 2, 0, 1) : 0.35;
    const confidence = it.reviews ? clamp(Math.log10(it.reviews + 1) / 3, 0, 1) : 0;
    const quality = ratingQ * (0.45 + 0.55 * confidence);
    const value = clamp(1 - it.price / (2 * med), 0, 1);
    const disc = clamp(discountPct / 60, 0, 1);
    const score = Math.round(100 * (0.55 * quality + 0.3 * value + 0.15 * disc));
    return { ...it, discountPct, score, medianPrice: med, brand: detectBrand(it.title) || detectBrand(it.store), trust: trustOf(it.store, it.title) };
  });
}

function detectBrand(title) {
  const t = " " + String(title).toLowerCase().replace(/[’]/g, "'") + " ";
  for (const b of BRANDS) {
    const needle = b.toLowerCase();
    const re = new RegExp("(^|[^a-z])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z]|$)");
    if (re.test(t)) return b === "Polo" ? "Ralph Lauren" : b;
  }
  return null;
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ---------- Browser-only code below ---------- */
if (typeof document !== "undefined") {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  let saved = store.get("snag_saved", []);

  const els = {
    hero: $("#hero"), form: $("#searchForm"), q: $("#q"), results: $("#results"), grid: $("#grid"), topPick: $("#topPick"),
    empty: $("#empty"), title: $("#resultTitle"), meta: $("#resultMeta"), sort: $("#sort"), min: $("#minPrice"), max: $("#maxPrice"),
    brandChips: $("#brandChips"), brandSearch: $("#brandSearch"), storeList: $("#storeList"), active: $("#activeChips"),
    filters: $("#filters"), backdrop: $("#backdrop"), recent: $("#recent"), savedCount: $("#savedCount"),
  };

  /* --- Search --- */
  async function runSearch(text, { keepFilters = false } = {}) {
    const p = parsePrompt(text);
    state.query = p.query;
    state.showingSaved = false;
    if (!keepFilters) {
      state.min = p.min; state.max = p.max;
      state.stores.clear();
      state.brands.clear();
      state.saleOnly = p.saleOnly;
      if (p.sort) state.sort = p.sort; else state.sort = "score";
    }
    syncControls();
    addRecent(text);

    els.hero.classList.add("compact");
    els.results.classList.remove("hidden");
    els.title.textContent = `“${p.query}”`;
    els.meta.textContent = "Searching every major store live…";
    els.topPick.innerHTML = "";
    els.empty.classList.add("hidden");
    els.grid.innerHTML = Array.from({ length: 8 }, (_, n) => `<div class="skeleton" style="animation-delay:${n * 0.08}s"></div>`).join("");
    startLoader(p.query);
    window.scrollTo({ top: 0, behavior: "smooth" });

    const params = new URLSearchParams({ q: p.query });
    if (state.min != null) params.set("min", state.min);
    if (state.max != null) params.set("max", state.max);
    try {
      const r = await fetch(`/api/search?${params}`);
      const data = await r.json();
      if (!r.ok) throw data;
      await stopLoader();
      state.items = scoreItems(data.items || []);
      state.fetchedAt = data.fetchedAt;
      state.sources = data.sources || null;
      buildStoreList();
      buildBrandChips();
      render();
    } catch (e) {
      await stopLoader();
      els.grid.innerHTML = "";
      els.meta.textContent = "";
      showEmpty(
        e && e.error === "missing_key"
          ? `<h3>Almost ready — add your API key</h3><p>In Vercel, go to <b>Settings → Environment Variables</b>, add <code>SERPAPI_KEY</code>, then redeploy.</p>`
          : `<h3>Search didn't go through</h3><p>${esc((e && e.message) || "Check your connection and try again.")}</p>`
      );
    }
  }

  /* --- Loading animation --- */
  const SCAN_STORES = ["Amazon", "Nike", "Nordstrom", "StockX", "Target", "eBay", "GOAT", "Macy's", "Dick's", "Walmart", "Grailed", "Kohl's", "Patagonia", "Foot Locker", "Stadium Goods", "REI"];
  const SCAN_STEPS = ["Google Shopping", "eBay", "Resale sites"];
  let loaderTimer = null, loaderStart = 0;

  function startLoader(query) {
    clearInterval(loaderTimer);
    loaderStart = Date.now();
    const tags = Array.from({ length: 6 }, (_, n) => {
      const a = n * 60 + 20, r = 22 + (n % 3) * 8;
      return `<span class="blip" style="--x:${Math.cos((a * Math.PI) / 180) * r}%;--y:${Math.sin((a * Math.PI) / 180) * r}%;--d:${(a / 360) * 2.4}s">$</span>`;
    }).join("");
    els.topPick.innerHTML = `<div class="loader" id="loader" role="status" aria-live="polite">
      <div class="radar"><div class="sweep"></div><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>${tags}
        <div class="core"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/></svg></div>
      </div>
      <div class="loader-text">
        <p class="loader-title">Hunting for the best <b>${esc(query)}</b></p>
        <p class="loader-store">Checking <span id="scanStore">Amazon</span><span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
        <div class="steps">${SCAN_STEPS.map((s, n) => `<span class="step" data-step="${n}"><em></em>${s}</span>`).join("")}</div>
      </div>
    </div>`;
    let i = 0;
    const storeEl = () => document.getElementById("scanStore");
    loaderTimer = setInterval(() => {
      i++;
      const el = storeEl();
      if (!el) return clearInterval(loaderTimer);
      el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
      el.textContent = SCAN_STORES[i % SCAN_STORES.length];
      const stepN = Math.min(SCAN_STEPS.length, Math.floor((Date.now() - loaderStart) / 600));
      document.querySelectorAll(".step").forEach((s) => {
        const n = +s.dataset.step;
        s.classList.toggle("done", n < stepN);
        s.classList.toggle("active", n === stepN);
      });
    }, 420);
  }

  async function stopLoader() {
    clearInterval(loaderTimer);
    const el = document.getElementById("loader");
    if (!el) return;
    // Let it show at least ~0.9s so it doesn't flash, then finish the steps and fade out
    const wait = Math.max(0, 1800 - (Date.now() - loaderStart));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    el.querySelectorAll(".step").forEach((s) => { s.classList.remove("active"); s.classList.add("done"); });
    const t = document.getElementById("scanStore");
    if (t) t.parentElement.innerHTML = "Done, ranking the deals";
    el.classList.add("finish");
    await new Promise((r) => setTimeout(r, 380));
  }

  /* --- Filtering + sorting --- */
  function filtered() {
    let list = state.showingSaved ? saved.slice() : state.items.slice();
    if (state.showingSaved) return list;
    list = list.filter((i) => {
      if (i.trust.tier === "fake") return false;
      if (state.authenticOnly && i.trust.tier === "unverified") return false;
      if (state.min != null && i.price < state.min) return false;
      if (state.max != null && i.price > state.max) return false;
      if (state.minRating && (i.rating == null || i.rating < state.minRating)) return false;
      if (state.saleOnly && !i.oldPrice) return false;
      if (state.ratedOnly && !i.reviews) return false;
      if (state.freeShip && !/free/i.test(i.delivery || "")) return false;
      if (state.brands.size && !state.brands.has(i.brand)) return false;
      if (state.stores.size && !state.stores.has(i.store)) return false;
      if (!matchesSeller(i, state.sellers)) return false;
      return true;
    });
    const by = {
      score: (a, b) => b.score - a.score,
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0),
      reviews: (a, b) => (b.reviews || 0) - (a.reviews || 0),
      discount: (a, b) => b.discountPct - a.discountPct,
    }[state.sort];
    return list.sort(by);
  }

  function render() {
    const list = filtered();
    renderActive();
    els.empty.classList.add("hidden");

    if (state.showingSaved) {
      els.title.textContent = "Saved items";
      els.meta.textContent = `${list.length} saved`;
      els.topPick.innerHTML = "";
      els.grid.innerHTML = list.map(cardHTML).join("");
      if (!list.length) showEmpty("<h3>Nothing saved yet</h3><p>Tap the ♡ on any item to keep it here.</p>");
      return;
    }

    els.title.textContent = `“${state.query}”`;
    const time = state.fetchedAt ? new Date(state.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const storesN = new Set(list.map((i) => i.store)).size;
    const hiddenUnverified = state.authenticOnly ? state.items.filter((i) => i.trust.tier === "unverified" && matchesSeller(i, state.sellers)).length : 0;
    const srcText = state.sources ? " · " + Object.entries(state.sources).map(([k, v]) => `${k} ${v}`).join(", ") : "";
    els.meta.textContent = `${list.length} of ${state.items.length} results · ${storesN} stores · live as of ${time}${srcText}`;

    if (!list.length) {
      els.topPick.innerHTML = "";
      els.grid.innerHTML = "";
      showEmpty(state.authenticOnly && state.items.some((i) => i.trust.tier === "unverified")
        ? `<h3>No verified sellers match</h3><p>${state.items.filter((i) => i.trust.tier === "unverified").length} listings from marketplace sellers are hidden.</p><p><button type="button" class="btn solid" id="showAllBtn">Show all sellers</button></p>`
        : state.sellers.size
          ? `<h3>None of your picked sellers have this</h3><p>Try adding more sellers, or pick <b>All stores</b>.</p>`
          : `<h3>No matches with these filters</h3><p>Try loosening the price, rating or brand filters.</p>`);
      return;
    }

    const notice = hiddenUnverified
      ? `<div class="hidden-notice"><span><b>${hiddenUnverified}</b> more listings from eBay, Grailed and other marketplace sellers are hidden by Authentic only.</span><button type="button" id="showAllBtn">Show them</button></div>`
      : "";
    // Top pick = best Snag Score among what's currently filtered
    const pick = [...list].sort((a, b) => b.score - a.score)[0];
    els.topPick.innerHTML = notice + topPickHTML(pick);
    els.grid.innerHTML = list.filter((i) => i !== pick).map(cardHTML).join("");
  }

  function showEmpty(html) { els.empty.innerHTML = html; els.empty.classList.remove("hidden"); }

  function stars(r) {
    if (r == null) return "";
    const full = Math.round(r);
    return "★".repeat(full) + "☆".repeat(5 - full);
  }
  function scoreColor(s) { return s >= 70 ? "#5ee39a" : s >= 50 ? "var(--accent)" : s >= 35 ? "#ffd166" : "#e2e2dc"; }
  const isSaved = (it) => saved.some((s) => s.id === it.id && s.store === it.store);

  const TRUST_ICON = { official: "✓", authorized: "✓", resale: "✓", unverified: "!" };
  function trustBadge(it) {
    if (!it.trust) return "";
    return `<span class="trust trust-${it.trust.tier}" title="${it.trust.tier === "unverified" ? "We can't confirm this seller sells authentic items" : "Seller sources from the brand or authenticates items"}">${TRUST_ICON[it.trust.tier] || ""} ${esc(it.trust.label)}</span>`;
  }

  function cardHTML(it) {
    return `<article class="card">
      <div class="img">
        ${it.thumbnail ? `<img loading="lazy" src="${esc(safeUrl(it.thumbnail))}" alt="">` : `<span class="noimg">No image</span>`}
        ${it.discountPct >= 5 ? `<span class="badge-off">-${it.discountPct}%</span>` : ""}
        ${it.score != null ? `<span class="score" style="background:${scoreColor(it.score)}" title="Snag Score">${it.score}</span>` : ""}
        <button class="heart ${isSaved(it) ? "on" : ""}" data-save="${esc(it.id)}|${esc(it.store)}" aria-label="Save">${isSaved(it) ? "♥" : "♡"}</button>
      </div>
      <div class="body">
        <div class="store">${esc(it.store)}</div>
        <div class="badges">${trustBadge(it)}${it.condition ? `<span class="cond">${esc(it.condition)}</span>` : ""}</div>
        <h3 title="${esc(it.title)}">${esc(it.title)}</h3>
        ${it.rating != null ? `<div class="rating"><span class="stars">${stars(it.rating)}</span>${it.rating.toFixed(1)}<span class="count">(${(it.reviews || 0).toLocaleString()})</span></div>` : `<div class="rating"><span class="count">No reviews yet</span></div>`}
        <div class="price"><span class="now">${money(it.price)}</span>${it.oldPrice ? `<s>${money(it.oldPrice)}</s>` : ""}</div>
        ${it.delivery ? `<div class="delivery">${esc(it.delivery)}</div>` : ""}
        <a class="btn" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer">View deal ↗</a>
      </div>
    </article>`;
  }

  function topPickHTML(it) {
    const why = [];
    if (it.rating != null) why.push(`${it.rating.toFixed(1)}★ from ${(it.reviews || 0).toLocaleString()} reviews`);
    if (it.discountPct >= 5) why.push(`${it.discountPct}% off`);
    const diff = it.medianPrice - it.price;
    if (diff >= 1) why.push(`${money(Math.round(diff))} below the typical price here`);
    if (/free/i.test(it.delivery || "")) why.push("Free delivery");
    why.push(`Snag Score ${it.score}/100`);
    return `<div class="top-pick">
      <div class="img">${it.thumbnail ? `<img src="${esc(safeUrl(it.thumbnail))}" alt="">` : ""}</div>
      <div>
        <span class="label">⚡ Top pick</span>
        <div class="store" style="margin-top:8px">${esc(it.store)}</div>
        <div style="margin-top:6px">${trustBadge(it)}</div>
        <h3>${esc(it.title)}</h3>
        <div class="price"><span class="now">${money(it.price)}</span>${it.oldPrice ? `<s>${money(it.oldPrice)}</s>` : ""}</div>
        <ul class="why">${why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
        <div class="actions">
          <a class="btn solid" href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer">Get this deal ↗</a>
          ${it.reviews ? `<a class="btn outline" href="${esc(safeUrl(it.reviewsLink))}" target="_blank" rel="noopener noreferrer">Read reviews</a>` : ""}
          <button class="btn outline heart-inline" data-save="${esc(it.id)}|${esc(it.store)}">${isSaved(it) ? "♥ Saved" : "♡ Save"}</button>
        </div>
      </div>
    </div>`;
  }

  /* --- Filter UI --- */
  function buildBrandChips() {
    const counts = {};
    state.items.forEach((i) => { if (i.brand) counts[i.brand] = (counts[i.brand] || 0) + 1; });
    const inResults = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const all = [...new Set([...inResults, ...BRANDS.filter((b) => b !== "Polo")])];
    const f = state.brandFilterText.toLowerCase();
    $("#brandNote").textContent = inResults.length ? `· ${inResults.length} found` : "";
    els.brandChips.innerHTML = all
      .filter((b) => !f || b.toLowerCase().includes(f))
      .map((b) => `<button type="button" data-brand="${esc(b)}" class="${state.brands.has(b) ? "on" : ""}">${esc(b)}${counts[b] ? `<span class="n">${counts[b]}</span>` : ""}</button>`)
      .join("");
  }

  function buildStoreList() {
    const counts = {};
    state.items.forEach((i) => (counts[i.store] = (counts[i.store] || 0) + 1));
    const stores = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    els.storeList.innerHTML = stores.length
      ? stores.map((s) => `<label><input type="checkbox" data-store="${esc(s)}" ${state.stores.has(s) ? "checked" : ""}>${esc(s)}<span class="n">${counts[s]}</span></label>`).join("")
      : `<span class="muted">Search to see stores</span>`;
  }

  function renderActive() {
    const chips = [];
    if (!state.authenticOnly) chips.push(["auth", "Showing all sellers"]);
    if (state.min != null) chips.push(["min", `Min ${money(state.min)}`]);
    if (state.max != null) chips.push(["max", `Under ${money(state.max)}`]);
    if (state.minRating) chips.push(["rating", `${state.minRating}★+`]);
    if (state.saleOnly) chips.push(["sale", "On sale"]);
    if (state.ratedOnly) chips.push(["rated", "Has reviews"]);
    if (state.freeShip) chips.push(["ship", "Free delivery"]);
    state.sellers.forEach((id) => chips.push(["seller:" + id, SELLERS.find((o) => o.id === id).label]));
    state.brands.forEach((b) => chips.push(["brand:" + b, b]));
    state.stores.forEach((s) => chips.push(["store:" + s, s]));
    els.active.innerHTML = state.showingSaved ? "" : chips.map(([k, l]) => `<button type="button" data-clear="${esc(k)}">${esc(l)} ✕</button>`).join("");
  }

  function syncControls() {
    els.min.value = state.min ?? "";
    els.max.value = state.max ?? "";
    els.sort.value = state.sort;
    $("#saleOnly").checked = state.saleOnly;
    $("#ratedOnly").checked = state.ratedOnly;
    $("#freeShip").checked = state.freeShip;
    document.querySelectorAll("[data-auth] button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "1") === state.authenticOnly));
    store.set("snag_auth", state.authenticOnly);
    store.set("snag_sellers", [...state.sellers]);
    renderSellerChips();
    document.querySelectorAll("#ratingSeg button").forEach((b) => b.classList.toggle("on", +b.dataset.v === state.minRating));
    buildBrandChips();
    buildStoreList();
  }

  function renderSellerChips() {
    const html =
      `<button type="button" data-seller="all" class="${state.sellers.size ? "" : "on"}">All stores</button>` +
      SELLERS.map((o) => `<button type="button" data-seller="${o.id}" class="${state.sellers.has(o.id) ? "on" : ""}">${esc(o.label)}</button>`).join("");
    document.querySelectorAll("[data-sellers]").forEach((el) => (el.innerHTML = html));
  }

  /* --- Recent + saved --- */
  function addRecent(text) {
    let r = store.get("snag_recent", []).filter((x) => x.toLowerCase() !== text.toLowerCase());
    r.unshift(text);
    store.set("snag_recent", r.slice(0, 5));
    renderRecent();
  }
  function renderRecent() {
    els.recent.innerHTML = store.get("snag_recent", []).map((r) => `<button type="button">${esc(r)}</button>`).join("");
  }
  function toggleSave(key) {
    const [id, st] = key.split("|");
    const idx = saved.findIndex((s) => String(s.id) === id && s.store === st);
    if (idx >= 0) saved.splice(idx, 1);
    else {
      const it = state.items.find((i) => String(i.id) === id && i.store === st);
      if (it) saved.unshift(it);
    }
    store.set("snag_saved", saved);
    els.savedCount.textContent = saved.length;
    render();
  }

  /* --- Events --- */
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = els.q.value.trim();
    if (v) runSearch(v);
  });
  $("#examples").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") { els.q.value = e.target.textContent; runSearch(e.target.textContent); }
  });
  els.recent.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") { els.q.value = e.target.textContent; runSearch(e.target.textContent); }
  });

  let priceTimer;
  const onPrice = () => {
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      state.min = els.min.value === "" ? null : +els.min.value;
      state.max = els.max.value === "" ? null : +els.max.value;
      if (state.query) runSearch(state.query, { keepFilters: true });
    }, 700);
  };
  els.min.addEventListener("input", onPrice);
  els.max.addEventListener("input", onPrice);

  $("#ratingSeg").addEventListener("click", (e) => {
    if (!e.target.dataset.v) return;
    state.minRating = +e.target.dataset.v;
    syncControls(); render();
  });
  document.querySelectorAll("[data-auth]").forEach((seg) => seg.addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.v;
    if (v == null) return;
    state.authenticOnly = v === "1";
    syncControls();
    if (state.query || state.showingSaved) render();
  }));
  document.querySelectorAll("[data-sellers]").forEach((el) => el.addEventListener("click", (e) => {
    const id = e.target.closest("button")?.dataset.seller;
    if (!id) return;
    if (id === "all") state.sellers.clear();
    else {
      state.sellers.has(id) ? state.sellers.delete(id) : state.sellers.add(id);
      // Picking only marketplace sellers (eBay/Grailed) needs Show all, or nothing would appear
      const picks = SELLERS.filter((o) => state.sellers.has(o.id));
      if (picks.length && picks.every((o) => o.marketplace)) state.authenticOnly = false;
    }
    syncControls();
    if (state.query) render();
  }));
  $("#saleOnly").addEventListener("change", (e) => { state.saleOnly = e.target.checked; render(); });
  $("#ratedOnly").addEventListener("change", (e) => { state.ratedOnly = e.target.checked; render(); });
  $("#freeShip").addEventListener("change", (e) => { state.freeShip = e.target.checked; render(); });
  els.sort.addEventListener("change", (e) => { state.sort = e.target.value; render(); });

  els.brandSearch.addEventListener("input", (e) => { state.brandFilterText = e.target.value; buildBrandChips(); });
  els.brandChips.addEventListener("click", (e) => {
    const b = e.target.closest("button")?.dataset.brand;
    if (!b) return;
    const has = state.brands.has(b);
    has ? state.brands.delete(b) : state.brands.add(b);
    // A brand with no matches in current results → run a fresh live search for that brand
    const inResults = state.items.some((i) => i.brand === b);
    if (!has && !inResults && state.query) {
      const base = state.query.replace(new RegExp("\\b" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), "").trim();
      els.q.value = `${b} ${base}`;
      runSearch(els.q.value, { keepFilters: true });
      return;
    }
    buildBrandChips(); render();
  });
  els.storeList.addEventListener("change", (e) => {
    const s = e.target.dataset.store;
    if (!s) return;
    e.target.checked ? state.stores.add(s) : state.stores.delete(s);
    render();
  });
  els.active.addEventListener("click", (e) => {
    const k = e.target.dataset.clear;
    if (!k) return;
    if (k === "min" || k === "max") { state[k] = null; syncControls(); runSearch(state.query, { keepFilters: true }); return; }
    if (k === "auth") state.authenticOnly = true;
    else if (k === "rating") state.minRating = 0;
    else if (k === "sale") state.saleOnly = false;
    else if (k === "rated") state.ratedOnly = false;
    else if (k === "ship") state.freeShip = false;
    else if (k.startsWith("brand:")) state.brands.delete(k.slice(6));
    else if (k.startsWith("seller:")) state.sellers.delete(k.slice(7));
    else if (k.startsWith("store:")) state.stores.delete(k.slice(6));
    syncControls(); render();
  });
  $("#resetFilters").addEventListener("click", () => {
    state.sellers.clear();
    Object.assign(state, { authenticOnly: true, minRating: 0, saleOnly: false, ratedOnly: false, freeShip: false, sort: "score" });
    state.brands.clear(); state.stores.clear();
    const hadPrice = state.min != null || state.max != null;
    state.min = state.max = null;
    syncControls();
    hadPrice && state.query ? runSearch(state.query, { keepFilters: true }) : render();
  });

  document.addEventListener("click", (e) => {
    if (e.target.id === "showAllBtn") { state.authenticOnly = false; syncControls(); render(); return; }
    const k = e.target.closest("[data-save]")?.dataset.save;
    if (k) { e.preventDefault(); toggleSave(k); }
  });
  $("#savedBtn").addEventListener("click", () => {
    state.showingSaved = !state.showingSaved;
    els.hero.classList.add("compact");
    els.results.classList.remove("hidden");
    if (!state.showingSaved && !state.query) { els.hero.classList.remove("compact"); els.results.classList.add("hidden"); return; }
    render();
  });

  const openDrawer = (o) => { els.filters.classList.toggle("open", o); els.backdrop.classList.toggle("hidden", !o); };
  $("#openFilters").addEventListener("click", () => openDrawer(true));
  $("#closeFilters").addEventListener("click", () => openDrawer(false));
  els.backdrop.addEventListener("click", () => openDrawer(false));
  $(".logo").addEventListener("click", (e) => {
    e.preventDefault();
    els.hero.classList.remove("compact"); els.results.classList.add("hidden"); els.q.value = ""; state.showingSaved = false; els.q.focus();
  });

  // Init
  state.authenticOnly = store.get("snag_auth", true) !== false;
  store.get("snag_sellers", []).forEach((id) => SELLERS.some((o) => o.id === id) && state.sellers.add(id));
  syncControls();
  els.savedCount.textContent = saved.length;
  renderRecent();
  buildBrandChips();
  const urlQ = new URLSearchParams(location.search).get("q");
  if (urlQ) { els.q.value = urlQ; runSearch(urlQ); }
}

if (typeof module !== "undefined") module.exports = { parsePrompt, scoreItems, detectBrand, trustOf };
