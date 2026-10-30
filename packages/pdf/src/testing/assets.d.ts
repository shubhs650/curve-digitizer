// Vite's `?inline` suffix turns a fixture into a data: URL, so package tests read binary fixtures without
// Node typings (the package compiles against the worker lib only).
declare module '*.pdf?inline' {
  const dataUrl: string;
  export default dataUrl;
}
