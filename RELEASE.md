# Release checklist

Two things to ship publicly: **deploy the site to Vercel** and **publish the npm
package**. Both are one command; both need your own login. The repo is already
prepared and verified (52 tests, evals, clean `npm publish --dry-run`).

## 1. Deploy the site to Vercel

The site lives in `site/` (Next.js). Your CLI token in the automated environment
was expired, so run this yourself from the repo root:

```bash
cd site
vercel login            # if `vercel whoami` errors — refreshes the token
vercel --prod           # first run: accept defaults; set project name "ai-command-center"
```

- First deploy asks a few questions — set **project name** to `ai-command-center`
  so the production URL becomes `https://ai-command-center.vercel.app` (the URL
  already wired into the site's metadata, `llms.txt`, sitemap, and the READMEs).
- If that name/URL is taken, pick another and tell me — I'll update the URLs in
  one pass and you redeploy.
- No environment variables are needed; it's a fully static marketing + docs site.
- Optional: add a real custom domain later in the Vercel dashboard, then update
  the same URLs.

Verify after deploy: the landing page, `/docs`, `/docs/comparison`, and
`/llms.txt` all load.

## 2. Publish to npm

The package is `ai-command-center` (the name is available). Contents were
verified with a dry run — 24 files, ~121 kB, includes LICENSE + README, no tests
or secrets.

```bash
cd packages/gateway
npm login                    # your npm account
npm publish --dry-run        # optional: re-confirm contents
npm publish --access public  # publishes v0.1.0
```

After publishing, verify:

```bash
npx ai-command-center@latest --version   # 0.1.0
npx ai-command-center demo && npx ai-command-center   # smoke test
```

### Optional: the thin SDKs

- JS: `cd packages/sdk-js && npm publish --access public` (scoped `@ai-command-center/sdk`;
  create the npm org/scope first, or rename to an unscoped name).
- Python: `cd packages/sdk-python && python -m build && twine upload dist/*`
  (name `aicc-sdk`).

## 3. Tag the release

```bash
git tag v0.1.0 && git push origin v0.1.0
# then draft a GitHub Release from the tag using the CHANGELOG entry
```

## Notes

- The GitHub repo redirects `AI-BOX` → `AI-Command-Center`; pushes work either
  way. To make it clean: `git remote set-url origin https://github.com/adityasarade/ai-command-center.git`.
- CI (`.github/workflows/ci.yml`) runs the test suite on Node 18/20/22 and a smoke
  eval on every push/PR once the repo is public.
