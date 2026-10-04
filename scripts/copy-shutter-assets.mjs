import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const assets = ["blst.js", "blst.wasm"];

for (const asset of assets) {
  const source = resolve("node_modules/@shutter-network/shutter-sdk/dist", asset);
  const destination = resolve("public", asset);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log(`Copied Shutter browser asset: ${asset}`);
}
