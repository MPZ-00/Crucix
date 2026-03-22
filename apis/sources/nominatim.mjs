// Nominatim Source — Location normalization service status + cache monitoring
// Imports utilities from ../utils/nominatim.mjs
// Provides both geocoding functions (for other sources) and standalone briefing

export { reverseGeocode, forwardGeocode, batchForwardGeocode, getCacheStats as getCacheStats, clearCache } from '../utils/nominatim.mjs';
export { briefing } from '../utils/nominatim.mjs';
