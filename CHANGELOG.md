# Changelog

All notable user-visible changes. Format: Keep a Changelog; versioning: SemVer (0.x during rev 0).

## Unreleased

### Added
- Open graph images (PNG, JPEG, WebP) with the file picker, by dropping them anywhere on the window, by pasting with Ctrl+V, or from the installed app's "Open with". Each image becomes a graph in a project; projects are saved on this device (origin private file system) and listed on the home screen, where they can be reopened or deleted.
- Installable app that works offline after the first visit, opens `.cdz` projects and PNG/JPEG/WebP images from the operating system, and offers "New version available — Reload" when an update is ready (it never reloads by itself).
- Strict Content Security Policy: the app can only talk to its own origin.
- App shell: header with OET home, Docs, Report issue (prefilled with version and browser) and GitHub links; empty project sidebar, tool rail, canvas, inspector and collapsible data dock; light theme by default with a dark theme toggle.
