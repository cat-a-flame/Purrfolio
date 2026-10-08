@AGENTS.md

# Git workflow
Always commit and push directly to the `main` branch. Do not create feature branches.

# Versioning
Claude owns the app version. Follow semver (MAJOR.MINOR.PATCH) and bump it in the same commit as the change:
- PATCH: bug fixes, styling and other tweaks.
- MINOR: new user-facing features.
- MAJOR: breaking changes, such as data or schema changes that need a migration.

Keep `version` in `app.json`, `package.json` and `package-lock.json` (two places) in sync. Do not touch the build number; EAS manages it (`appVersionSource: remote`, `autoIncrement`).
