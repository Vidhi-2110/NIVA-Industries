/**
 * One-subscription-per-email guard for the footer newsletter form.
 *
 * Serverless functions are stateless, so "this address already subscribed" has to live in an
 * external store. This module uses an Upstash Redis database through its REST API (no npm
 * dependency; add it from Vercel → Project → Storage / Marketplace → Upstash Redis, free tier).
 * Either pair of environment variable names works:
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   KV_REST_API_URL        + KV_REST_API_TOKEN
 *
 * Privacy: only a SHA-256 hash of the normalised address is stored (plus the signup time), never
 * the address itself, so the store can't be read back as an email list.
 *
 * Without a store (or if it is unreachable) the module falls back to an in-memory set. That only
 * remembers addresses on the same warm serverless instance, so it is a best-effort guard, not a
 * guarantee. A store outage never blocks a signup.
 */

const crypto = require('crypto');

const KEY_PREFIX = 'niva:subscriber:';
const REQUEST_TIMEOUT_MS = 4000;
const memory = new Set();

function storeConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

// Lower-case, and for Gmail also ignore dots and "+tag" (john.doe+x@gmail.com is john doe's inbox).
// Other providers keep the full local part: "+" is not a tag separator everywhere.
function canonicalEmail(email) {
  const [rawLocal, rawDomain] = String(email).trim().toLowerCase().split('@');
  if (rawDomain === 'gmail.com' || rawDomain === 'googlemail.com') {
    return `${rawLocal.split('+')[0].replace(/\./g, '')}@gmail.com`;
  }
  return `${rawLocal}@${rawDomain}`;
}

function fingerprint(email) {
  return crypto.createHash('sha256').update(canonicalEmail(email)).digest('hex');
}

async function redis(config, command) {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Redis REST error ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Redis error: ${data.error}`);
  return data.result;
}

// Atomically records the address. Returns 'new' the first time, 'duplicate' afterwards.
async function claimSubscription(email) {
  const id = fingerprint(email);
  const config = storeConfig();

  if (config) {
    try {
      // SET ... NX only succeeds if the key does not exist yet, so two simultaneous
      // submissions of the same address can't both come back as 'new'.
      const result = await redis(config, ['SET', KEY_PREFIX + id, new Date().toISOString(), 'NX']);
      if (result === 'OK') {
        memory.add(id);
        return 'new';
      }
      return 'duplicate';
    } catch (err) {
      console.error('Subscriber store unavailable, using in-memory check.', err.message);
    }
  }

  if (memory.has(id)) return 'duplicate';
  memory.add(id);
  return 'new';
}

// Undo a claim when the signup could not be completed, so the visitor can try again.
async function releaseSubscription(email) {
  const id = fingerprint(email);
  memory.delete(id);
  const config = storeConfig();
  if (!config) return;
  try {
    await redis(config, ['DEL', KEY_PREFIX + id]);
  } catch (err) {
    console.error('Could not release subscriber claim.', err.message);
  }
}

// Time-limited slot, e.g. "at most one enquiry acknowledgement per address per hour".
// Returns true when the slot was free (and is now taken for `ttlSeconds`), false when it is taken.
// Same storage and fallback behaviour as claimSubscription; a store outage never blocks.
const timedMemory = new Map();

async function claimTimedSlot(scope, email, ttlSeconds) {
  const id = `${scope}:${fingerprint(email)}`;
  const config = storeConfig();

  if (config) {
    try {
      const result = await redis(config, ['SET', `niva:slot:${id}`, '1', 'NX', 'EX', String(ttlSeconds)]);
      return result === 'OK';
    } catch (err) {
      console.error('Slot store unavailable, using in-memory check.', err.message);
    }
  }

  const now = Date.now();
  const until = timedMemory.get(id);
  if (until && until > now) return false;
  timedMemory.set(id, now + ttlSeconds * 1000);
  if (timedMemory.size > 5000) timedMemory.clear();
  return true;
}

module.exports = { claimSubscription, releaseSubscription, claimTimedSlot, canonicalEmail, fingerprint };
