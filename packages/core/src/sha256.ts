// WebCrypto is present in every supported browser, in workers and in Node 22, but core compiles
// without the DOM lib, so declare only the one call we make.
interface Digest {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

const subtle = (globalThis as unknown as { readonly crypto: { readonly subtle: Digest } }).crypto.subtle;

/** Lowercase hex SHA-256 of `bytes`. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
