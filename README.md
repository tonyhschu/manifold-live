# ManifoldCAD Live

Write ManifoldCAD code in your code editor and have a live preview of it in the browser.

Current Status: ... barely works.

## Try it out

Clone this repo, then run `npm link` in the cloned folder.

Then, in the folder where you are developing your ManifoldCAD project, run:

```bash
npx manifold-live yourManifoldFile.ts
```

Go to localhost:3000 to see your model rendered via `<model-viewer>`
