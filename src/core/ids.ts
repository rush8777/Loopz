/**
 * Lightweight ID generation. Avoids pulling in a uuid dependency to keep
 * the bundle tiny. Not cryptographically significant - these are
 * non-sensitive, non-PII correlation identifiers only.
 */
export function generateId(prefix?: string): string {
  const rand = randomHex(16);
  const time = Date.now().toString(36);
  const id = `${time}-${rand}`;
  return prefix ? `${prefix}_${id}` : id;
}

function randomHex(length: number): string {
  let out = "";
  const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj && "getRandomValues" in cryptoObj) {
    const arr = new Uint8Array(length / 2);
    cryptoObj.getRandomValues(arr);
    for (const byte of arr) out += byte.toString(16).padStart(2, "0");
  } else {
    for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

export function now(): number {
  return Date.now();
}
