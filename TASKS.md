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

## Progress
### Done
- [x] hollywood-ai-agent.xyz - REGISTERED & DEPLOYED
- [x] Full Web UI with 9 pages - DONE
- [x] AI Chat (Gemini/GPT-4) - DONE
- [x] Research (DuckDuckGo) - DONE
- [x] Code Builder - DONE
- [x] Browser Automation - DONE
- [x] File Manager - DONE
- [x] Project Tracker - DONE
- [x] Deploy (Vercel/Netlify/Cloudflare) - DONE
- [x] Pricing ($0/$2/$5) - DONE
- [x] Stripe Checkout - DONE
- [x] Discord Notifications - DONE
- [x] Email Auth - DONE
- [x] Google OAuth - DONE (needs keys)

## Environment Variables Needed
- GEMINI_API_KEY
- OPENAI_API_KEY
- STRIPE_SECRET_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET

## Live URL
https://hollywood-ai-agent.xyz
- [x] Add ad injection to Website Builder (OpenPage) - DONE
- [x] Add user accounts (JWT mock) to Website Builder - DONE
- [x] Integrate real JWT backend (Supabase) for both builders - DONE
- [x] Replace proprietary Exa API with DuckDuckGo (Hollywood research) - DONE
- [x] Replace Google AdSense with Revive Adserver (Website Builder) - DONE
- [x] Add GitHub/Cloudflare Pages workflows (Website Builder) - DONE
- [x] Replace Trigger.dev with Docker sandbox (App Builder) - DONE
- [x] Create Coolify Docker config for App Builder - DONE

## ✅ DNS + Deployment — ALL DONE
- https://hollywood-ai-agent.xyz is LIVE and resolving correctly
- Vercel alias connected: `hollywood-agent-r5dfqm7dy` → `hollywood-ai-agent.xyz`
- HuggingFace + Groq API keys active in Vercel env vars

## Next Steps
- [x] Add ALIAS DNS record at Porkbun.com — DONE (site resolves)
- [x] Deploy Hollywood Agent web UI to Vercel — DONE
- [x] Connect domain to Vercel deployment — DONE
- [x] Fix status display (was showing "Demo" even with Groq/HF keys) — DONE
- [x] Update Groq model to llama-3.3-70b-versatile — DONE
- [x] Add Pricing link to homepage nav — DONE
- [x] Fix Stripe checkout missing recurring interval — DONE
- [ ] Add persistent storage (Supabase or Vercel KV) — users/data lost on cold starts
- [ ] Add STRIPE_SECRET_KEY to Vercel env vars for live payments
- [ ] Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for Google OAuth
- [ ] Run daily self-improvement research cycle
- [ ] Add rate limiting (100 req/day for free tier enforcement)
- [ ] Add ad injection (Revive AdServer) to monetize free tier

(End of file - total 54 lines)