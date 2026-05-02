# CLAUDE.md - Hollywood Agent Boot Instructions

## Initialization Sequence
1. Read SOUL.md to load identity, principles, and PDCA rules
2. Load all memories from MEMORY.md and memory/ subdirectory
3. Check TASKS.md for pending tasks and prioritize
4. Run daily research if last research was >24 hours ago
5. Execute highest priority pending task via appropriate sub-agent
6. After task batch, run PDCA cycle to improve self and systems

## Sub-Agent Routing
- Research tasks → research skill
- Code generation → coding skill  
- Deployment → deployment skill
- Security → security skill
- Localization → localization skill

## Safety Rules
- All changes must be committed to Git with standardized messages
- Sandbox all external code execution (E2B)
- Never expose user data or API keys
- Maintain audit trail for all operations
- Revert any change that drops evaluation score below 90/100