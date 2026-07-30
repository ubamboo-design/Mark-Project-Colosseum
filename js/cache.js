// =============================================================================
// PROJECT COLISEUM — Client-Side Cache Module
// =============================================================================
// Handles localStorage persistence for offline fallback. All operations are
// wrapped in try/catch to guard against private browsing mode or storage
// quota errors.
// =============================================================================

import { CACHE_KEY } from './config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cache validity window — 1 hour in milliseconds (60 × 60 × 1000). */
export const CACHE_AGE_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Saving / Loading
// ---------------------------------------------------------------------------

/**
 * Serialise `data` to JSON and persist under CACHE_KEY.
 * @param {*} data — Any JSON-serialisable value (typically an object with
 *   top-level keys: cards, strategies, events).
 */
export function saveToCache(data) {
  try {
    const serialised = JSON.stringify(data);
    localStorage.setItem(CACHE_KEY, serialised);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[cache] localStorage quota exceeded — data not saved.', err);
    } else {
      console.warn('[cache] Failed to write to localStorage.', err);
    }
  }
}

/**
 * Read the cached payload from localStorage and parse it as JSON.
 * @returns {*} Parsed data, or `null` if the key is missing, parsing fails,
 *   or storage is unavailable.
 */
export function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Inspect the current cache state without deserialising the payload.
 * @returns {{ exists: boolean, age: number, timestamp: string|null }}
 *   - exists: Whether CACHE_KEY is present in localStorage.
 *   - age:    Approximate milliseconds since the item was last saved (0 if
 *             the item does not exist or the timestamp is missing).
 *   - timestamp: ISO-8601 string reflecting the point at which the cache was
 *             last saved, or null if unavailable.
 */
export function getCacheMeta() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) {
      return { exists: false, age: 0, timestamp: null };
    }

    const data = JSON.parse(raw);
    const savedTs = data && data.timestamp ? Number(data.timestamp) : 0;
    const now = Date.now();
    const age = savedTs > 0 ? now - savedTs : 0;
    const ts = new Date(now).toISOString();

    return { exists: true, age, timestamp: ts };
  } catch {
    return { exists: false, age: 0, timestamp: null };
  }
}

// ---------------------------------------------------------------------------
// Freshness Check
// ---------------------------------------------------------------------------

/**
 * Determine whether the cached data is still considered fresh.
 * @param {{ exists: boolean, age: number, timestamp: string|null }} meta
 *   Metadata object returned by `getCacheMeta()`.
 * @returns {boolean} `true` when the cache exists and its age is below
 *   the CACHE_AGE_MS threshold.
 */
export function isCacheFresh(meta) {
  return meta.exists && meta.age < CACHE_AGE_MS;
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

/** Remove the cached entry from localStorage. */
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (err) {
    console.warn('[cache] Failed to clear localStorage entry.', err);
  }
}

// ---------------------------------------------------------------------------
// Structure Validation
// ---------------------------------------------------------------------------

/**
 * Quick structural sanity check on cached data.
 * Verifies that the expected top-level keys (cards, strategies, events) exist
 * and that their values are of the expected types.
 * @param {*} data — The value returned by `loadFromCache()`.
 * @returns {boolean} `true` if the structure looks valid.
 */
export function validateCacheStructure(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const checks = [
    ['cards',       (v) => v && typeof v === 'object' && !Array.isArray(v)],
    ['strategies',  (v) => v && typeof v === 'object' && !Array.isArray(v)],
    ['events',      Array.isArray],
  ];

  return checks.every(([key, typeCheck]) => typeCheck(data[key]));
}