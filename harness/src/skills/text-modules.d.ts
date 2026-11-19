declare module "*.md" {
  const text: string;
  export default text;
}

/** Files embedded with `import x from "./a.wasm" with { type: "file" }` resolve to a path. */
declare module "*.wasm" {
  const path: string;
  export default path;
}
