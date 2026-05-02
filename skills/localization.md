# Localization Skill - Multilingual Support

## Purpose
Add and maintain multilingual support across all systems.

## Tools
- websearch (translation APIs, i18n best practices)
- read/write (JSON configs, translation files)

## Workflow
1. Detect needed languages from user base
2. Generate translation files (JSON) for UI strings
3. Implement i18n in website/app builders (Chai Builder has built-in i18n)
4. Use LLMs (Claude/Gemini) for automatic translation
5. Test localized versions
6. Update TASKS.md with new language support

## Supported Languages (Initial)
- English (default)
- Spanish
- French
- German
- Dutch
- Mandarin
- Arabic

## Implementation
- Store translations in `locales/` directory per system
- Use standard i18n libraries (react-i18next for React stacks)
- Auto-detect user browser language