# Browser integration

The official `@shutter-network/shutter-sdk` dynamically loads `/blst.js` and `/blst.wasm` when used in a browser.

A dApp integrating 33HOXO must copy both files from:

`node_modules/@shutter-network/shutter-sdk/dist/`

into the application's public/static root so they are served as:

- `/blst.js`
- `/blst.wasm`

For Vite applications, exclude `@shutter-network/shutter-sdk` from dependency optimization if the bundler reports an incompatibility.

```ts
export default defineConfig({
  optimizeDeps: {
    exclude: ["@shutter-network/shutter-sdk"],
  },
});
```

## Node / ESM compatibility

Shutter SDK 0.0.2 publishes both ESM and CommonJS builds. Its ESM BLST bundle can fail under Node ESM with a dynamic-`require("fs")` error.

33HOXO therefore loads:

- the SDK's browser/ESM path in browsers;
- the SDK's CommonJS export in Node.

CI pins an official Shutter encryption/decryption vector to verify this compatibility wrapper.

## Mary Jane integration check

The current Mary Jane `public/` directory does not contain the Shutter SDK browser assets. They must be installed before browser-side 33HOXO encryption can be considered live.

Node tests cannot prove browser asset serving, so the deployed Mary Jane application still needs a browser smoke test.
