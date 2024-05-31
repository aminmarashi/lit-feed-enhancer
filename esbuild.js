const functionName = process.argv[2];
require("esbuild").build({
  entryPoints: [functionName],
  sourcemap: true, // Source map generation must be turned on
  platform: "node",
  bundle: true,
  outdir: "dist",
  tsconfig: "tsconfig.json",
  loader: { ".node": "file" },
  external: ["@aws-sdk/client-s3"],
});