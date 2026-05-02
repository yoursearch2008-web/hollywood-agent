# Deployment Skill - Automated Deployment

## Purpose
Deploy website and app builder systems to free tiers and manage updates.

## Tools
- bash (Vercel CLI, Netlify CLI, Git)
- websearch (find deployment guides)

## Workflow
1. Receive deployment task from orchestrator
2. Prepare build (run tests, lint)
3. Deploy to target platform:
   - Vercel: `vercel --prod`
   - Netlify: `netlify deploy --prod`
   - Cloudflare Pages: `wrangler pages deploy`
4. Verify deployment success
5. Update TASKS.md with deployment status
6. Report to orchestrator

## Auto-Update Process
- Daily check for dependency updates (npm outdated)
- Apply security patches immediately
- Update frameworks to latest stable versions weekly
- Commit all updates with "chore: auto-update dependencies" message