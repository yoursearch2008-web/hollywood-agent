## Goal
- Create Hollywood AI agent to build 2 automated free website/app builders with monetization, lowest pricing, self-improvement, and security

## Constraints & Preferences
- Agent named Hollywood (corrected from "holywood")
- 2 separate fully automated systems: website builder + app builder
- End users 100% free, monetize via ads + other methods
- Cheapest in market
- Mandatory user accounts, secure for owner and users
- Agent self-improving, continuous research on new opportunities
- Multilingual support
- Auto-updates, fully automated operation
- No unauthorized IPTV content allowed
- **ALL PROPRIETARY TOOLS REPLACED WITH FREE OPEN-SOURCE SOFTWARE**

## Live URL
https://hollywood-ai-agent.xyz

## ✅ Completed

### Infrastructure
- [x] Domain registered & DNS live (hollywood-ai-agent.xyz → Vercel)
- [x] Full Web UI with 9 pages deployed
- [x] AI Chat — Groq llama-3.3-70b-versatile (active), HuggingFace fallback
- [x] Research via DuckDuckGo
- [x] Code Builder, Browser Automation, File Manager, Project Tracker, Deploy page
- [x] Pricing page ($0 / $2 / $5)
- [x] Discord notifications

### Auth & Payments
- [x] Email signup (session-based)
- [x] Google OAuth — client ID + secret added to Vercel ⚠️ needs redirect URI in Google Console
- [x] Stripe Checkout — sk_test key active, recurring subscription, client_reference_id
- [x] Stripe Webhook — endpoint live (we_1TTRb32ORjilaCYRg7sxxsIP), signature verification, secret in Vercel
- [x] Rate limiting — 100 req/day free tier, paid users unlimited

### Storage
- [x] Storage abstraction layer (lib/storage.js) — Vercel KV when available, in-memory fallback
- [ ] **PERSISTENT STORAGE** — Vercel KV requires Pro plan ($20/mo). Options:
  - Option A: Upgrade Vercel to Pro → KV auto-activates (no code changes needed)
  - Option B: Create free Upstash account at upstash.com → add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to Vercel → update storage.js to use @upstash/redis

### Open-source replacements
- [x] DuckDuckGo replaces Exa API
- [x] Revive Adserver replaces Google AdSense (website-builder)
- [x] GitHub/Cloudflare Pages workflows (website-builder)
- [x] Docker sandbox replaces Trigger.dev (app-builder)
- [x] Coolify Docker config for app-builder

## ⚠️ One manual step still needed
**Google OAuth redirect URI** — add to Google Cloud Console:
  1. Go to: https://console.cloud.google.com/apis/credentials
  2. Click OAuth client: 658544621654-ft2uko2750ofnapjdjdohebr7j24rmi8
  3. Add Authorized redirect URI: https://hollywood-ai-agent.xyz/api/auth?path=callback/google

## Next Steps
- [ ] Persistent storage (Upstash or Vercel Pro KV)
- [ ] Add Google OAuth redirect URI in Google Cloud Console (manual)
- [ ] Run daily self-improvement research cycle (cron)
- [ ] Add Revive AdServer ad injection to main hollywood-agent UI
- [ ] Deploy website-builder to its own Vercel project
- [ ] Deploy app-builder to Coolify / Railway
- [ ] Add webhook for subscription cancellation (downgrade user to starter)
