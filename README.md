# Snag — live clothing deal & review finder

Type what you want ("find me the best quarter zip under $50"). Snag searches Google Shopping live across every major store and brand, then ranks results by a **Snag Score** (rating × how many reviews back it up + price vs. the other results + discount).

## Files
- `index.html`, `style.css`, `app.js`: the site
- `api/search.js`: Vercel serverless function that fetches live results (keeps your API key secret)

## 1. Get a free search API key
1. Sign up at https://serpapi.com (free plan includes monthly searches).
2. Copy your API key from the dashboard.

## 2. Deploy on Vercel
1. Make a new GitHub repo and upload everything in this folder (keep the `api` folder).
2. On vercel.com: **Add New → Project →** import the repo → **Deploy** (no build settings needed).
3. Go to **Settings → Environment Variables**, add:
   - Name: `SERPAPI_KEY`
   - Value: your key
4. **Deployments → ⋯ → Redeploy** so the key takes effect.

Searches are cached for 10 minutes at Vercel's edge, so repeat searches don't use up credits.

## Tips
- Share a search as a link: `https://your-site.vercel.app/?q=nike hoodie under 60`
- Edit the brand list at the top of `app.js` (`BRANDS`).
