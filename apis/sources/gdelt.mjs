// GDELT — Global Database of Events, Language, and Tone
// No auth required. Updates every 15 minutes. Monitors news in 100+ languages.
// Enhanced: Germany-focused with EU economic context + global risk signals
// DOC 2.0 API: full-text search across last 3 months of global news
// GEO 2.0 API: geolocation mapping of events

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://api.gdeltproject.org/api/v2';

// Search recent global events/articles by keyword
export async function searchEvents(query = '', opts = {}) {
	const {
		mode = 'ArtList',       // ArtList, TimelineVol, TimelineVolInfo, TimelineTone, TimelineLang, TimelineSourceCountry
		maxRecords = 75,
		timespan = '24h',       // e.g. "24h", "7d", "3m"
		format = 'json',
		sortBy = 'DateDesc',    // DateDesc, DateAsc, ToneDesc, ToneAsc
	} = opts;

	// If no query, use broad geopolitical terms
	const q = query || 'conflict OR crisis OR military OR sanctions OR war OR economy';
	const params = new URLSearchParams({
		query: q,
		mode,
		maxrecords: String(maxRecords),
		timespan,
		format,
		sort: sortBy,
	});

	return safeFetch(`${BASE}/doc/doc?${params}`, { timeout: 15000, retries: 1 });
}

// Get tone/sentiment timeline for a topic
export async function toneTrend(query, timespan = '7d') {
	const params = new URLSearchParams({
		query,
		mode: 'TimelineTone',
		timespan,
		format: 'json',
	});
	return safeFetch(`${BASE}/doc/doc?${params}`, { timeout: 15000, retries: 1 });
}

// Get volume timeline for a topic (how much coverage)
export async function volumeTrend(query, timespan = '7d') {
	const params = new URLSearchParams({
		query,
		mode: 'TimelineVol',
		timespan,
		format: 'json',
	});
	return safeFetch(`${BASE}/doc/doc?${params}`, { timeout: 15000, retries: 1 });
}

// GEO API — geographic event mapping
export async function geoEvents(query = '', opts = {}) {
	const {
		mode = 'PointData',
		timespan = '24h',
		format = 'GeoJSON',
		maxPoints = 500,
	} = opts;

	const q = query || 'conflict OR military OR protest OR explosion';
	const params = new URLSearchParams({
		query: q,
		mode,
		timespan,
		format,
		maxpoints: String(maxPoints),
	});

	return safeFetch(`${BASE}/geo/geo?${params}`, { timeout: 15000, retries: 1 });
}

// Compact article for briefing
function compactArticle(a) {
	return {
		title: a.title,
		url: a.url,
		date: a.seendate,
		domain: a.domain,
		language: a.language,
		country: a.sourcecountry,
	};
}

// Rate limit enforcement: 1 request per 5 seconds
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Briefing: Germany-centric events with EU + global context
export async function briefing() {
	// Phase 1: Germany-specific events
	const germanyEvents = await searchEvents(
		'Germany OR Deutschland OR Berlin OR Scholz OR "German government" OR Bundestag',
		{ maxRecords: 50, timespan: '24h' }
	);

	// Phase 2: EU economic + political signals
	await delay(5500);
	const euEvents = await searchEvents(
		'EU OR European OR Brussels OR "European Commission" OR economy OR trade OR tariff OR sanctions',
		{ maxRecords: 50, timespan: '24h' }
	);

	// Phase 3: Global risk signals that impact Germany
	await delay(5500);
	const globalRisks = await searchEvents(
		'conflict OR military OR war OR sanctions OR trade war OR supply chain OR energy crisis OR recession',
		{ maxRecords: 50, timespan: '24h' }
	);

	// Combine and categorize by source
	const allArticles = [
		...(germanyEvents?.articles || []).map(a => ({ ...a, _region: 'Germany' })),
		...(euEvents?.articles || []).map(a => ({ ...a, _region: 'EU' })),
		...(globalRisks?.articles || []).map(a => ({ ...a, _region: 'Global' })),
	];

	// Deduplicate by URL and compact
	const seen = new Set();
	const articles = [];
	for (const a of allArticles) {
		if (!seen.has(a.url)) {
			articles.push({ ...compactArticle(a), region: a._region });
			seen.add(a.url);
		}
	}

	const topArticles = articles.slice(0, 20);

	// Categorize by keyword in titles
	const categorize = (keywords) => articles.filter(a =>
		keywords.some(k => (a.title || '').toLowerCase().includes(k))
	);

	// Geo events — get mapped event locations (separate API, respects rate limit)
	await delay(5500);
	let geoPoints = [];
	try {
		const geo = await geoEvents(
			'Germany OR EU OR conflict OR military OR protest OR crisis',
			{ maxPoints: 50, timespan: '24h' }
		);
		geoPoints = (geo?.features || [])
			.filter(f => f.geometry?.coordinates)
			.map(f => ({
				lat: f.geometry.coordinates[1],
				lon: f.geometry.coordinates[0],
				name: f.properties?.name || '',
				count: f.properties?.count || 1,
				type: f.properties?.type || 'event',
			}))
			.slice(0, 30);
	} catch (e) { /* Optional — don't break briefing */ }

	// Extract signals
	const signals = [];
	const germanyCount = articles.filter(a => a.region === 'Germany').length;
	const euCount = articles.filter(a => a.region === 'EU').length;

	if (germanyCount > 10) signals.push(`Germany: ${germanyCount} stories (24h)`);
	else if (germanyCount > 0) signals.push(`Germany news: ${germanyCount} stories`);

	if (euCount > 15) signals.push(`EU signals: ${euCount} political/economic stories`);

	const economyArticles = categorize(['economy', 'recession', 'inflation', 'market', 'gdp', 'trade']);
	if (economyArticles.length > 5) signals.push(`Economic: ${economyArticles.length} stories`);

	const conflictArticles = categorize(['conflict', 'war', 'military', 'sanctions', 'attack']);
	if (conflictArticles.length > 8) signals.push(`Geopolitical risk: ${conflictArticles.length} stories`);

	return {
		source: 'GDELT',
		timestamp: new Date().toISOString(),
		summary: {
			totalArticles: articles.length,
			germanyArticles: germanyCount,
			euArticles: euCount,
			globalArticles: articles.filter(a => a.region === 'Global').length,
		},
		topArticles,
		geoPoints,
		byCategory: {
			economy: categorize(['economy', 'recession', 'inflation', 'market', 'gdp', 'trade']).slice(0, 5),
			conflict: categorize(['conflict', 'war', 'military', 'sanctions']).slice(0, 5),
		},
		signals: signals.length > 0 ? signals : ['No significant signals in last 24h'],
	};
}

// Run standalone
if (process.argv[1]?.endsWith('gdelt.mjs')) {
	const data = await briefing();
	console.log(JSON.stringify(data, null, 2));
}
