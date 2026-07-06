import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  // ESM output has no require(), but bundled CommonJS dependencies still call it for node builtins
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.mjs",
    loader: { ".graphql": "text" },
  }),
  build({
    ...common,
    entryPoints: ["review-status/src/index.ts"],
    outfile: "review-status/dist/index.mjs",
  }),
]);
