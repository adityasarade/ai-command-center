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

## Optional follow-ups

### Tag the release

```bash
git tag v0.1.0 && git push origin v0.1.0
# then draft a GitHub Release from the tag using the CHANGELOG entry
```

### Publish the thin SDKs

The gateway does not need these - they only set base-URL env vars.

- **JS**: `cd packages/sdk-js && npm publish --access public`. The name is scoped
  (`@ai-command-center/sdk`), so create the npm org/scope first or rename to
  unscoped.
- **Python**: `cd packages/sdk-python && python -m build && twine upload dist/*`
  (name `aicc-sdk`).

## Cutting the next version

1. Update [`CHANGELOG.md`](CHANGELOG.md): move items from `[Unreleased]` into a new
   dated version section.
2. Bump the version in `packages/gateway/package.json`.
3. `cd packages/gateway && npm publish --access public` (needs `npm login` + OTP).
4. Tag and push as above.
