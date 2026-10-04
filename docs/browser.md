# Browser integration

The official `@shutter-network/shutter-sdk` dynamically loads `/blst.js` and `/blst.wasm` when used in a browser.

A dApp integrating 33HOXO must copy both files from:

`node_modules/@shutter-network/shutter-sdk/dist/`

into the application's public/static root so they are served as:

- `/blst.js`
- `/blst.wasm`

For Vite applications, exclude `@shutter-network/shutter-sdk` from dependency optimization if the bundler reports an incompatibility.

Example:

```ts
export default defineConfig({
  optimizeDeps: {
    exclude: ["@shutter-network/shutter-sdk"],
  },
});
```

## Mary Jane integration check

The current Mary Jane `public/` directory does not contain these Shutter SDK assets. They must be installed before browser-side 33HOXO encryption can be considered live.

Node-based tests do not catch this because the browser-only WASM loading path is not exercised in CI.
