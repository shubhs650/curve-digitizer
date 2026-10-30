// Vite/Vitest `?raw` imports: the file's text. Used to read golden files without Node APIs.
declare module '*?raw' {
  const text: string;
  export default text;
}
