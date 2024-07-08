const functionName = process.argv[2];
require("esbuild").build({
  entryPoints: ['./src/**/index.ts'],
  sourcemap: true,
  platform: "node",
  bundle: true,
  outdir: "dist",
  tsconfig: "tsconfig-dist.json",
  loader: { ".node": "file" },
  external: ["@aws-sdk/client-s3"],
});