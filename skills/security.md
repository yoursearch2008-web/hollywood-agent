# Security Skill - Protection & Compliance

## Purpose
Ensure system security, user data protection, and regulatory compliance.

## Tools
- bash (security scans, SSL checks)
- read/write (audit logs)
- websearch (vulnerability reports)

## Workflow
1. Monitor security advisories daily
2. Run dependency vulnerability scans (npm audit, snyk)
3. Ensure JWT auth for all user accounts
4. Maintain E2B sandboxes for user builds
5. Enforce SSL/TLS for all connections
6. Generate audit logs for all operations (Git commits)
7. Ensure GDPR/CCPA compliance (data export/deletion)

## Security Checklist
- [ ] JWT with bcrypt hashed passwords
- [ ] E2B sandboxes for all user-generated code
- [ ] SSL/TLS certificates (LetsEncrypt)
- [ ] Git-based audit trail for all changes
- [ ] No user data sold or shared
- [ ] Clear privacy policy and terms
- [ ] Regular security patches (auto-applied)