# Claude Instructions

## Game Version

The game version lives in `src/version.ts` as `GAME_VERSION` and is displayed on the main menu.

**Update `GAME_VERSION` on every code change.** Use semantic versioning (`MAJOR.MINOR.PATCH`):
- `PATCH` — bug fixes, tweaks
- `MINOR` — new features / milestones
- `MAJOR` — breaking changes or full redesigns

Current version: `0.5.2`

## SPEC.md Maintenance

After completing or partially completing any milestone, update the milestone table in `SPEC.md` to reflect current implementation progress. Mark each milestone with one of the following statuses:

- `✅ Done` — fully implemented
- `🔄 In Progress` — partially implemented
- `⬜ Pending` — not yet started

Example table row:
```
| **0 — CI/CD & GitHub Pages** ✅ Done | ... |
```
