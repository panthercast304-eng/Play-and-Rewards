# Plus For You — Watch Ads, Play Games & Earn Rewards

A GitHub Pages front end backed by Supabase. Users watch ads / play games to
earn coins, refer friends, and request withdrawals. All coin, referral and
withdrawal writes happen through Supabase Postgres RPC functions — the
browser never writes balances directly.

## File structure

| File | Purpose |
|---|---|
| `index.html` | Main app: auth, home, ads, games, referral, profile/withdraw pages. Includes embedded mini-games (base64) and third-party ad-network tags. |
| `admin.html` | Admin-only dashboard (stats + withdrawal approval). Not linked from the main app; not indexed (`noindex, nofollow`). |
| `script.js` | Front-end logic for `index.html` — Supabase auth, profile loading, ad/game/referral/withdrawal flows. |
| `config.js` | **Single source of truth** for the public Supabase URL + anon key. Loaded by both `index.html` and `admin.html`. Never put a Supabase *service-role* key here — anon key only. |
| `style.css` | Shared styles for all pages. |
| `sw.js` | Service worker — currently only used to load a third-party ad-network push script. |
| `robots.txt` / `sitemap.xml` | SEO config. |

## Setup before going live

1. **Analytics/Ads placeholders** — `index.html` still has literal placeholder
   IDs that need to be replaced with your real ones:
   - `G-XXXXXXXXXX` — Google Analytics Measurement ID (2 occurrences)
   - `ca-pub-XXXXXXXXXXXXXXXX` and `data-ad-slot="XXXXXXXXXX"` — AdSense
     publisher ID / slot ID
2. **`og-image.png`** — referenced in the Open Graph / Twitter card meta tags
   for link previews, but isn't part of this file set. Add it at the repo
   root (recommended size 1200×630) or remove those meta tags.
3. **Ad networks** — `index.html`/`sw.js` currently load several third-party
   ad networks (AdSense, a couple of "profitableratecpmnetwork.com" tags,
   Monetag, HilltopAds, OnClicka). Review which of these you actually want
   live before publishing — some of these networks are known for aggressive
   popunders/push ads, which can affect how browsers and app-store-style
   reviewers treat the site.
4. **Supabase RLS** — the anon key in `config.js` is meant to be public, but
   it's only safe if Row Level Security policies on every table are locked
   down server-side. Double-check this in the Supabase dashboard.

## Notes

- Real rewards are verified server-side by an approved ad provider — this
  project does not fake ad completion.
- Game Points have no cash value and are not wagers.
