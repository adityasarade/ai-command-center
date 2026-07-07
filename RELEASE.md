# Release status

## ✅ Done

- **Repo is public & open-sourced**: https://github.com/adityasarade/ai-command-center
  (renamed to lowercase, remote updated, description/homepage/topics set, MIT).
- **Site is live**: https://aicommandcenter.vercel.app (Vercel production).
  All routes, assets, `llms.txt`, `sitemap.xml`, and every internal + external
  link verified 200; navigation and the interactive demo work.
- **Verified**: 52 tests pass, evals pass, `npm publish --dry-run` clean
  (24 files, ~121 kB, includes LICENSE + README).

## ⏳ Remaining: publish to npm (needs your npm login)

npm isn't authenticated in the automated environment, so this one step is yours.
Two options — either works:

**A. Let me publish it** — authenticate npm once, then tell me and I'll run the publish:

```bash
npm login            # in your terminal (opens browser / OTP)
npm whoami           # confirms you're logged in
```

**B. Publish it yourself** — one command:

```bash
cd packages/gateway
npm publish --access public   # publishes ai-command-center@0.1.0
```

Verify after publishing:

```bash
npx ai-command-center@latest --version   # 0.1.0
```

### Optional: the thin SDKs

- JS: `cd packages/sdk-js && npm publish --access public` — the name is scoped
  (`@ai-command-center/sdk`); create the npm org/scope first or rename to unscoped.
- Python: `cd packages/sdk-python && python -m build && twine upload dist/*` (name `aicc-sdk`).

## Tag the release (optional, nice-to-have)

```bash
git tag v0.1.0 && git push origin v0.1.0
# then draft a GitHub Release from the tag using the CHANGELOG entry
```
