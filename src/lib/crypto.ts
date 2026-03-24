// AES-GCM encryption using Web Crypto API.
// Secret is loaded from VITE_ENCRYPTION_SECRET env var.
// Ciphertext format: "<base64-iv>.<base64-ciphertext>"

const SECRET = import.meta.env.VITE_ENCRYPTION_SECRET as string

if (!SECRET) {
  // VITE_ENCRYPTION_SECRET is not set — sensitive fields will not be encrypted
}

const enc = new TextEncoder()
const dec = new TextDecoder()

async function getKey(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(SECRET))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!SECRET || !plaintext) return plaintext
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return `${toBase64(iv.buffer as ArrayBuffer)}.${toBase64(ciphertext)}`
}

export async function decrypt(ciphertext: string): Promise<string> {
  if (!SECRET || !ciphertext) return ciphertext
  // If it doesn't look like our format, return as-is (legacy plain values)
  if (!ciphertext.includes('.')) return ciphertext
  try {
    const [ivB64, ctB64] = ciphertext.split('.')
    const key = await getKey()
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(ctB64))
    return dec.decode(plain)
  } catch {
    return '[decryption failed]'
  }
}
