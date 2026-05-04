// Storage abstraction — priority order:
//   1. Upstash Redis (free tier) — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   2. Vercel KV (Pro plan only) — set KV_REST_API_URL + KV_REST_API_TOKEN
//   3. In-memory Maps (resets on cold start — development/fallback only)
//
// To enable free persistent storage: create a free account at upstash.com, create a Redis DB,
// then add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables.

let kv = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    kv = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    kv = require('@vercel/kv').kv;
  }
} catch (e) { /* redis package not installed or not configured — using in-memory fallback */ }

const KV = !!kv;

// In-memory fallback stores
const _users    = new Map();
const _sessions = new Map();
const _files    = new Map();
const _projects = new Map();

// ─── Users ───────────────────────────────────────────────────────────────────

async function getUser(id) {
  if (KV) return (await kv.hgetall(`u:${id}`)) || null;
  return _users.get(id) || null;
}

async function setUser(id, data) {
  if (KV) {
    await kv.hset(`u:${id}`, data);
    await kv.sadd('idx:users', id);
  } else {
    _users.set(id, { ...data });
  }
}

async function userCount() {
  if (KV) return kv.scard('idx:users');
  return _users.size;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

async function getSessionUserId(token) {
  if (KV) return kv.get(`s:${token}`);
  return _sessions.get(token) || null;
}

async function setSessionToken(token, userId, ttl = 2592000) {
  if (KV) await kv.set(`s:${token}`, userId, { ex: ttl });
  else _sessions.set(token, userId);
}

async function deleteSessionToken(token) {
  if (KV) await kv.del(`s:${token}`);
  else _sessions.delete(token);
}

// ─── Files ────────────────────────────────────────────────────────────────────

async function getFile(name) {
  if (KV) return kv.get(`f:${name}`);
  return _files.get(name) ?? null;
}

async function setFile(name, content) {
  if (KV) {
    await kv.set(`f:${name}`, content);
    await kv.sadd('idx:files', name);
  } else {
    _files.set(name, content);
  }
}

async function deleteFile(name) {
  if (KV) {
    await kv.del(`f:${name}`);
    await kv.srem('idx:files', name);
  } else {
    _files.delete(name);
  }
}

async function listFiles() {
  if (KV) {
    const names = await kv.smembers('idx:files');
    if (!names.length) return [];
    const contents = await Promise.all(names.map(n => kv.get(`f:${n}`)));
    return names.map((name, i) => ({ name, content: contents[i] || '' }));
  }
  return Array.from(_files.entries()).map(([name, content]) => ({ name, content }));
}

async function fileCount() {
  if (KV) return kv.scard('idx:files');
  return _files.size;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

async function getProject(name) {
  if (KV) return (await kv.hgetall(`p:${name}`)) || null;
  return _projects.get(name) || null;
}

async function setProject(name, data) {
  if (KV) {
    await kv.hset(`p:${name}`, data);
    await kv.sadd('idx:projects', name);
  } else {
    _projects.set(name, { ...data });
  }
}

async function listProjects() {
  if (KV) {
    const names = await kv.smembers('idx:projects');
    if (!names.length) return [];
    const rows = await Promise.all(names.map(n => kv.hgetall(`p:${n}`)));
    return names.map((name, i) => ({ name, ...rows[i] }));
  }
  return Array.from(_projects.entries()).map(([name, data]) => ({ name, ...data }));
}

async function projectCount() {
  if (KV) return kv.scard('idx:projects');
  return _projects.size;
}

// ─── Stripe customer → user mapping ──────────────────────────────────────────
const _stripeMap = new Map();

async function setStripeCustomer(stripeCustomerId, userId) {
  if (KV) await kv.set(`sc:${stripeCustomerId}`, userId);
  else _stripeMap.set(stripeCustomerId, userId);
}

async function getUserIdByStripeCustomer(stripeCustomerId) {
  if (KV) return kv.get(`sc:${stripeCustomerId}`);
  return _stripeMap.get(stripeCustomerId) || null;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Returns current request count for a key. Increments and sets TTL on first call.
async function rateCheck(key, windowSeconds = 86400) {
  if (KV) {
    const count = await kv.incr(`rl:${key}`);
    if (count === 1) await kv.expire(`rl:${key}`, windowSeconds);
    return count;
  }
  // In-memory rate limit (resets on cold start — acceptable fallback)
  const rl = _rl.get(key) || { count: 0, reset: Date.now() + windowSeconds * 1000 };
  if (Date.now() > rl.reset) { rl.count = 0; rl.reset = Date.now() + windowSeconds * 1000; }
  rl.count++;
  _rl.set(key, rl);
  return rl.count;
}
const _rl = new Map();

module.exports = {
  isKVEnabled: () => KV,
  getUser, setUser, userCount,
  getSessionUserId, setSessionToken, deleteSessionToken,
  getFile, setFile, deleteFile, listFiles, fileCount,
  getProject, setProject, listProjects, projectCount,
  setStripeCustomer, getUserIdByStripeCustomer,
  rateCheck,
};
