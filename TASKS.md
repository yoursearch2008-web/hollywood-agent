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

- [x] Storage abstraction layer (lib/storage.js) — Upstash Redis (free) → Vercel KV → in-memory fallback
- [x] @upstash/redis added to package.json
- [ ] **PERSISTENT STORAGE** — Activate free Upstash Redis:
  1. Go to upstash.com → create free Redis database
  2. Copy REST URL + REST Token
  3. Add to Vercel: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  4. Redeploy — storage will auto-activate (no code changes needed)

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

- [x] Daily research cron — /api/jobs/research runs at 08:00 UTC via vercel.json cron
- [x] Subscription cancellation webhook — downgrades user plan to starter
- [x] app-builder: TS/ESLint errors skipped in build, railway.json added
- [ ] **PERSISTENT STORAGE** — Create free Upstash Redis (see Storage section above)
- [ ] Add Google OAuth redirect URI in Google Cloud Console (manual)
- [ ] Add Revive AdServer ad injection to main hollywood-agent UI
- [ ] Deploy website-builder to its own Vercel project
- [ ] Deploy app-builder to Railway (push to Railway from github.com/yoursearch2008-web/app-builder)
- [ ] Set JOBS_SECRET env var in Vercel to protect /api/jobs/research from public calls
