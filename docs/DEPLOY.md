# Deploying

Curve Digitizer is a static site on Cloudflare Pages at https://curve-digitizer.openengtools.com (ADR 32). There is no server code: `pnpm build` writes everything to `apps/web/dist`, including the `_headers` file that sets cross-origin isolation, the CSP and asset caching.

## One-time setup (repository owner)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `shubhs650/curve-digitizer`.
2. Build settings:
   - Framework preset: None
   - Build command: `pnpm build`
   - Build output directory: `apps/web/dist` (also set in `wrangler.toml`)
   - Environment variable: `NODE_VERSION` = the version in `.nvmrc`
3. Production branch: `main`. Pull requests get preview deployments.
4. Custom domains → add `curve-digitizer.openengtools.com`.

No secrets or API tokens are involved: Pages builds from the repository itself.

Do not add a `404.html` to `apps/web/public`: without one, Pages serves `index.html` for unknown paths, which is what `/docs/<page>` needs on a first visit.

## Releasing

1. Move `## Unreleased` in `CHANGELOG.md` under a new version heading and record the manual targets.
2. Bump `version` in `package.json` and `apps/web/package.json` (the app shows the latter).
3. Merge to `main`; Pages deploys it.
4. Tag the merge commit `v<version>` and push the tag.

## Verifying a deploy

On the production URL, in a fresh browser profile:

- `crossOriginIsolated` is `true` in the console, and the response headers include `Cross-Origin-Embedder-Policy: require-corp` and the `Content-Security-Policy`.
- The header shows **Ready offline for images** once the page has loaded, then **Ready offline** after opening a PDF.
- With the network off (DevTools → Network → Offline), reload: the app loads, the open project is restored, and a PDF page can be cropped.
- `/docs/calibration` loads directly.
- The first line of a CSV export names the deployed version.
