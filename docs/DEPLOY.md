# Deploying

Curve Digitizer is a static site served by Cloudflare Workers static assets at https://curve-digitizer.openengtools.com (ADR 46, which replaces Pages from ADR 32). There is no Worker script: `pnpm build` writes everything to `apps/web/dist`, including the `_headers` file that sets cross-origin isolation, the CSP and asset caching, and `wrangler.toml` at the repository root tells `wrangler deploy` to upload that folder.

## One-time setup (repository owner)

1. Cloudflare dashboard → Workers & Pages → Create → Import a repository → `shubhs650/curve-digitizer` (Workers Builds).
2. Build settings:
   - Root directory: `/` (the repository root, where `wrangler.toml` is)
   - Build command: `pnpm build`
   - Deploy command: `npx wrangler deploy` (the default)
   - Non-production branch deploy command: `npx wrangler versions upload` (the default), for pull request previews
   - Environment variable: `NODE_VERSION` = the version in `.nvmrc`
3. Production branch: `main`.
4. Settings → Domains & Routes → add the custom domain `curve-digitizer.openengtools.com`.

No secrets or API tokens are involved: Workers Builds builds from the repository itself.

Pull request previews only work once `main` has deployed at least once: before that the Worker does not exist and the preview check fails with "This Worker does not exist on your account".

Do not add a `404.html` to `apps/web/public`: `not_found_handling = "single-page-application"` in `wrangler.toml` serves `index.html` for unknown paths, which is what `/docs/<page>` needs on a first visit.

## Releasing

1. Move `## Unreleased` in `CHANGELOG.md` under a new version heading and record the manual targets.
2. Bump `version` in `package.json` and `apps/web/package.json` (the app shows the latter).
3. Merge to `main`; Workers Builds deploys it.
4. Tag the merge commit `v<version>` and push the tag.

## Verifying a deploy

On the production URL, in a fresh browser profile:

- `crossOriginIsolated` is `true` in the console, and the response headers include `Cross-Origin-Embedder-Policy: require-corp` and the `Content-Security-Policy`.
- The header shows **Ready offline for images** once the page has loaded, then **Ready offline** after opening a PDF.
- With the network off (DevTools → Network → Offline), reload: the app loads, the open project is restored, and a PDF page can be cropped.
- `/docs/calibration` loads directly.
- The first line of a CSV export names the deployed version.
