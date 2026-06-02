function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(cipherBuf))}`;
}

export async function decrypt(ciphertext: string, keyHex: string): Promise<string> {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = await importKey(keyHex);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(ivHex) },
    key,
    hexToBytes(encHex),
  );

  return new TextDecoder().decode(decrypted);
}
