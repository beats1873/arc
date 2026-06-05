import axios from 'axios';

const _cache = new Map(); // userId → { buf, at }
const TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch an avatar image as a Buffer, returning a cached copy if available.
 * @param {string} userId  Discord user ID (used as cache key)
 * @param {string} url     CDN URL to fetch from
 * @param {number} [timeout=3000] HTTP timeout in ms
 */
export async function fetchAvatar(userId, url, timeout = 3000) {
  if (!url) return null;
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.buf;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout });
    const buf = Buffer.from(res.data);
    _cache.set(userId, { buf, at: Date.now() });
    return buf;
  } catch {
    return null;
  }
}

/** Eagerly warm the cache for a list of { userId, url } pairs in parallel. */
export async function prefetchAvatars(entries) {
  await Promise.all(entries.map(({ userId, url }) => fetchAvatar(userId, url)));
}
