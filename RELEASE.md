# Release status

## ✅ Shipped

- **Published to npm**: [`ai-command-center@0.1.0`](https://www.npmjs.com/package/ai-command-center)
  (public, MIT, zero runtime deps). Install-free run:

  ```bash
  npx ai-command-center@latest --version   # 0.1.0
  ```

- **Repo is public & open-sourced**: https://github.com/adityasarade/ai-command-center
  (MIT, description/homepage/topics set).
- **Site is live**: https://aicommandcenter.vercel.app (Vercel production). All
  routes, assets, `llms.txt`, `sitemap.xml`, and every internal and external link
  verified 200; navigation and the interactive demo work.
- **Verified**: 61 tests pass, evals pass, the published tarball includes LICENSE
  and README (26 files, ~130 kB).

## ⏳ Ready to publish: 0.1.1

`packages/gateway` is bumped to `0.1.1` (dashboard search + pagination on every
view; CI glob fix). Committed and CI-green; the npm upload needs your OTP:

```bash
cd packages/gateway
npm publish --access public       # publishes ai-command-center@0.1.1, asks for OTP
```

Then tag it: `git tag v0.1.1 && git push origin v0.1.1`.

- **Tagged**: `v0.1.0` is pushed, with a GitHub Release:
  https://github.com/adityasarade/ai-command-center/releases/tag/v0.1.0

## Optional follow-ups: publish the thin SDKs

The gateway does not need these - they only set base-URL env vars - but
publishing them makes `aicc.init()` / `import { init }` installable. Both are
build-verified; the upload step needs your account (and a 2FA OTP), so it is
yours to run.

**JS - `@ai-command-center/sdk`** (scoped, so the npm org must exist first):

```bash
# one-time: create a free org named "ai-command-center" at
# https://www.npmjs.com/org/create  (public packages are free)
cd packages/sdk-js
npm publish --access public       # asks for your OTP
```

**Python - `aicc-sdk`** (this repo uses uv; there is no pip on PATH):

```bash
cd packages/sdk-python
uv build                          # already verified: builds sdist + wheel, twine check passes
uvx twine upload dist/*           # needs a PyPI account + API token
```

## Cutting the next version

1. Update [`CHANGELOG.md`](CHANGELOG.md): move items from `[Unreleased]` into a new
   dated version section.
2. Bump the version in `packages/gateway/package.json`.
3. `cd packages/gateway && npm publish --access public` (needs `npm login` + OTP).
4. Tag and push as above.
