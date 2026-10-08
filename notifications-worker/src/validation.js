export function validSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048) return false;
  let url;
  try { url = new URL(value.endpoint); } catch { return false; }
  const host = url.hostname;
  const allowed = host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
    host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com';
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false;
  const validKey = (key, bytes) => {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(key)) return false;
    try { return atob(key.replace(/-/g,'+').replace(/_/g,'/')).length === bytes; } catch { return false; }
  };
  return validKey(value.keys?.p256dh,65) && validKey(value.keys?.auth,16);
}

export function validTimer(value, now = Date.now()) {
  return typeof value.id === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(value.id) &&
    Number.isSafeInteger(value.revision) && Math.abs(value.revision - now * 1000) < 86400000000 &&
    Number.isSafeInteger(value.endsAt) && value.endsAt > now && value.endsAt <= now + 601000;
}

export async function limitedJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  let total = 0;
  const parts = [];
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 8192) { await reader.cancel(); throw new Error('Body too large'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {bytes.set(part,offset);offset += part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
