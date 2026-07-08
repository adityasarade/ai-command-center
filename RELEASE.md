# Release status

## ✅ Shipped

- **Gateway on npm**: [`ai-command-center`](https://www.npmjs.com/package/ai-command-center),
  latest `0.1.1` (public, MIT, zero runtime deps). Install-free run:

  ```bash
  npx ai-command-center@latest --version   # 0.1.1
  ```

- **Thin SDKs published**:
  - JS: [`@ai-command-center/sdk`](https://www.npmjs.com/package/@ai-command-center/sdk)
    (`npm install @ai-command-center/sdk`), under the `ai-command-center` npm org.
  - Python: [`aicc-sdk`](https://pypi.org/project/aicc-sdk/) (`pip install aicc-sdk`).
- **Repo is public & open-sourced**: https://github.com/adityasarade/ai-command-center
  (MIT, description/homepage/topics set).
- **Site is live**: https://aicommandcenter.vercel.app (Vercel production). All
  routes, assets, `llms.txt`, `sitemap.xml`, and every internal and external link
  verified 200; navigation and the interactive demo work.
- **Tagged with GitHub Releases**:
  - [`v0.1.0`](https://github.com/adityasarade/ai-command-center/releases/tag/v0.1.0) - first public release.
  - [`v0.1.1`](https://github.com/adityasarade/ai-command-center/releases/tag/v0.1.1) - dashboard search & pagination.
- **Verified**: 61 tests pass on Node 18/20/22, CI is green, evals pass.

## Cutting the next version

1. Update [`CHANGELOG.md`](CHANGELOG.md): move items from `[Unreleased]` into a new
   dated version section.
2. Bump the version in `packages/gateway/package.json`.
3. `cd packages/gateway && npm publish --access public` (needs `npm login` + OTP).
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`, then
   `gh release create vX.Y.Z --notes-file <notes>`.

The SDKs version independently; publish them the same way from `packages/sdk-js`
(`npm publish`) and `packages/sdk-python` (`uv build && uvx twine upload dist/*`).
