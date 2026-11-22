// Encrypted career pack: the owner's tailored opportunity list, pathways and profile seed are personal, so the
// public repo/site only holds ciphertext (AES-256-GCM, key from a passphrase via PBKDF2-SHA256). The owner unlocks
// it once on the phone; the decrypted pack lives in IndexedDB only. Works in the browser and in Node (WebCrypto).

export interface EncryptedPack {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 (ciphertext + tag)
}

const b64 = (u: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass.trim().toLowerCase()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptPack(data: unknown, pass: string, iter = 310_000): Promise<EncryptedPack> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await key(pass, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(data))));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

/** Throws if the passphrase is wrong (GCM authentication fails). */
export async function decryptPack<T>(p: EncryptedPack, pass: string): Promise<T> {
  const k = await key(pass, unb64(p.salt), p.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) as BufferSource }, k, unb64(p.ct) as BufferSource);
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}
