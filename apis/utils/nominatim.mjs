// Nominatim / OSM — Germany location normalization & geocoding
// Utility for reverse/forward geocoding with caching
// Free tier: ~1 req/sec (strict rate limit — caching essential)

import { safeFetch } from './fetch.mjs';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const CACHE_TTL_MINUTES = 5;

// Simple LRU cache with TTL
class CachedNominatim {
  constructor(maxSize = 1000, ttlMinutes = CACHE_TTL_MINUTES) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.cache = new Map();
    this.accessOrder = [];
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const { value, timestamp } = this.cache.get(key);
    if (Date.now() - timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return null;
    }
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
    this.accessOrder.push(key);

    if (this.accessOrder.length > this.maxSize) {
      const oldestKey = this.accessOrder.shift();
      this.cache.delete(oldestKey);
    }
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expiredEntries: Array.from(this.cache.entries()).filter(
        ([_, { timestamp }]) => Date.now() - timestamp > this.ttlMs
      ).length,
    };
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }
}

const locationCache = new CachedNominatim();

// Reverse geocode: lat/lon → location details
export async function reverseGeocode(lat, lon) {
  const key = `rev_${lat.toFixed(4)}_${lon.toFixed(4)}`;
  const cached = locationCache.get(key);
  if (cached) return cached;

  try {
    const data = await safeFetch(
      `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { timeout: 10000, retries: 0 } // Strict: no retries on Nominatim free tier
    );

    if (data.error) return data;

    const address = data.address || {};
    const result = {
      displayName: data.display_name,
      lat: data.lat,
      lon: data.lon,
      city: address.city || address.town || address.village || null,
      bundesland: address.state || null,
      country: address.country || null,
      postcode: address.postcode || null,
      osmId: data.osm_id,
      osmType: data.osm_type,
    };

    locationCache.set(key, result);
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

// Forward geocodefont: address → lat/lon + metadata
export async function forwardGeocode(query) {
  const key = `fwd_${query.toLowerCase()}`;
  const cached = locationCache.get(key);
  if (cached) return cached;

  try {
    const data = await safeFetch(
      `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
      { timeout: 10000, retries: 0 }
    );

    if (!Array.isArray(data) || data.length === 0) {
      return { error: `No location found for: ${query}` };
    }

    const first = data[0];
    const address = first.address || {};
    const result = {
      displayName: first.display_name,
      lat: parseFloat(first.lat),
      lon: parseFloat(first.lon),
      city: address.city || address.town || address.village || null,
      bundesland: address.state || null,
      country: address.country || null,
      postcode: address.postcode || null,
      osmId: first.osm_id,
      osmType: first.osm_type,
    };

    locationCache.set(key, result);
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

// Batch forward geocode with rate limiting (Nominatim strict: 1 req/sec)
export async function batchForwardGeocode(queries) {
  const results = [];
  for (const query of queries) {
    results.push(await forwardGeocode(query));
    await new Promise(r => setTimeout(r, 1100)); // 1.1s delay between requests
  }
  return results;
}

// Get cache statistics. Useful for monitoring API efficiency.
export function getCacheStats() {
  return locationCache.stats();
}

// Clear cache (emergency use only)
export function clearCache() {
  locationCache.clear();
}

// Briefing: Nominatim service status + cache health
export async function briefing() {
  const stats = getCacheStats();
  const healthCheckUrl = `${NOMINATIM_BASE}/status.php?format=json`;
  
  let serviceHealthy = true;
  let statusMessage = 'Nominatim API healthy';
  
  try {
    const status = await safeFetch(healthCheckUrl, { timeout: 5000, retries: 0 });
    if (status.error || status.status !== 0) {
      serviceHealthy = false;
      statusMessage = status.error || 'Service degraded';
    }
  } catch (e) {
    serviceHealthy = false;
    statusMessage = e.message;
  }

  return {
    source: 'Nominatim',
    timestamp: new Date().toISOString(),
    status: {
      apiHealthy: serviceHealthy,
      statusMessage,
    },
    cache: {
      entries: stats.size,
      maxSize: stats.maxSize,
      hitRate: stats.size > 0 ? ((stats.size / stats.maxSize) * 100).toFixed(1) : '0',
    },
    signals: [
      `Nominatim service: ${statusMessage}`,
      `Location cache: ${stats.size} entries (${stats.size > 0 ? ((stats.size / stats.maxSize) * 100).toFixed(0) : 0}% utilization)`,
    ],
  };
}
