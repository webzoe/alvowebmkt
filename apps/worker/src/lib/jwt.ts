interface JwtPayload {
  sub: string;
  exp: number;
  iat: number;
  email?: string;
  role?: string;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );

    if (!valid) return null;

    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload;

    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;

    return decoded;
  } catch {
    return null;
  }
}
