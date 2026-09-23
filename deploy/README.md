# Manual Netlify deploy fallback

`grimoire-netlify-manual-deploy.zip` is a prebuilt copy of the production
site (`npm run build` output) — a fallback for deploying by hand if the
GitHub → Netlify auto-deploy connection is ever broken, without needing a
Node/npm environment to build from source.

**To use it:** unzip it, then drag the extracted folder onto
[Netlify's manual deploy page](https://app.netlify.com/) (Sites → your
site → Deploys → drag and drop), or run `netlify deploy --dir=<extracted-folder> --prod`
with the Netlify CLI.

Built from commit `e1b8794` (2026-09-23). This zip is a point-in-time
snapshot — it does **not** update itself. Regenerate it after future
changes with:

```sh
npm install
npm run build
cd dist && zip -r -X ../deploy/grimoire-netlify-manual-deploy.zip . -x ".*"
```
