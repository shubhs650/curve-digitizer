# Changelog

All notable user-visible changes. Format: Keep a Changelog; versioning: SemVer (0.x during rev 0).

## Unreleased

### Added
- Datasets panel in the inspector: add one dataset per curve (colours assigned from a colour-blind-safe palette), and give each a name, colour, mode (function y = f(x) or path in pick order), family parameter (e.g. Temperature = 300 °C), X/Y units, source reference and notes. Every change is undoable with Ctrl+Z / Ctrl+Y or the undo/redo buttons on the tool rail.
- Graph canvas: zoom with the mouse wheel (about the cursor), the +/− keys or the zoom bar; 0 fits the image, 1 shows actual size. Pan with the pan tool (H), the middle mouse button, Space + drag or the arrow keys. A loupe (L) magnifies the pixels under the cursor with a crosshair, and the cursor position is shown in image pixels. Digitized points are drawn over the original image in their dataset colour and highlight under the cursor.
- Open graph images (PNG, JPEG, WebP) with the file picker, by dropping them anywhere on the window, by pasting with Ctrl+V, or from the installed app's "Open with". Each image becomes a graph in a project; projects are saved on this device (origin private file system) and listed on the home screen, where they can be reopened or deleted.
- Installable app that works offline after the first visit, opens `.cdz` projects and PNG/JPEG/WebP images from the operating system, and offers "New version available — Reload" when an update is ready (it never reloads by itself).
- Strict Content Security Policy: the app can only talk to its own origin.
- App shell: header with OET home, Docs, Report issue (prefilled with version and browser) and GitHub links; empty project sidebar, tool rail, canvas, inspector and collapsible data dock; light theme by default with a dark theme toggle.
