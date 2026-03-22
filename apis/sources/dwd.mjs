// DWD (Deutscher Wetterdienst) — German Weather & Severe Alerts
// Free tier: public JSON/GeoJSON feeds, no API key required
// Updates: alerts real-time, weather observations hourly

import { safeFetch, today } from '../utils/fetch.mjs';
import { reverseGeocode } from '../utils/nominatim.mjs';

const DWD_ALERTS_URL = 'https://opendata.dwd.de/weather/weather_alerts/poi/';
const DWD_CURRENT_URL = 'https://opendata.dwd.de/weather/weather_alerts/poi/DWD_poi_alerts_de.geojson';

// Fetch and parse active weather alerts for Germany
async function getAlerts() {
  try {
    const data = await safeFetch(DWD_CURRENT_URL, {
      timeout: 15000,
      retries: 1,
      headers: { 'Accept': 'application/geo+json' },
    });

    if (data.error) return { alerts: [], error: data.error };
    if (!data.features || !Array.isArray(data.features)) return { alerts: [] };

    return {
      alerts: data.features
        .map(feature => {
          const props = feature.properties || {};
          return {
            id: props.id,
            headline: props.HEADLINE,
            severity: props.SEVERITY || 'Unknown', // Extreme, Severe, Moderate, Minor
            urgency: props.URGENCY || 'Unknown',
            event: props.EVENT || 'Weather Alert',
            area: props.AREA_DESC || props.AREACODE,
            category: props.CATEGORY || 'Other',
            coordinates: feature.geometry?.coordinates,
            startTime: props.ONSET,
            endTime: props.EXPIRES,
          };
        })
        .sort((a, b) => {
          const severityOrder = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
          return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
        }),
    };
  } catch (e) {
    return { alerts: [], error: e.message };
  }
}

// Get basic weather data from observation (single observation point as proxy)
async function getCurrentWeather() {
  try {
    // DWD makes weather observation data available via MOSMIX/ICON
    // For simplicity, focus on alert severity as weather proxy
    return {
      source: 'DWD observations (limited free tier)',
    };
  } catch (e) {
    return { error: e.message };
  }
}

// Categorize alerts by severity and impact type
function categorizeAlerts(alerts) {
  const extreme = alerts.filter(a => a.severity === 'Extreme');
  const severe = alerts.filter(a => a.severity === 'Severe');
  const moderate = alerts.filter(a => a.severity === 'Moderate');

  const hurricanes = alerts.filter(a => /sturm|orkan|hurrikan/i.test(a.event));
  const flooding = alerts.filter(a => /hochwasser|überflutung|hochwasser|starkniederschlag|regen/i.test(a.event));
  const frost = alerts.filter(a => /frost|eis|schnee|blitzeis/i.test(a.event));
  const heat = alerts.filter(a => /hitze|wärmewelle|hitzewelle/i.test(a.event));
  const other = alerts.filter(a => !hurricanes.includes(a) && !flooding.includes(a) && !frost.includes(a) && !heat.includes(a));

  return {
    extreme: extreme.length,
    severe: severe.length,
    moderate: moderate.length,
    total: alerts.length,
    byType: {
      storms: hurricanes.length,
      flooding: flooding.length,
      frost: frost.length,
      heat: heat.length,
      other: other.length,
    },
  };
}

// Briefing: current German weather alerts + conditions
export async function briefing() {
  const { alerts, error: alertError } = await getAlerts();

  if (alertError && alerts.length === 0) {
    return {
      source: 'DWD',
      timestamp: new Date().toISOString(),
      error: alertError,
      hint: 'Visit https://opendata.dwd.de/ for manual check',
      signals: [],
    };
  }

  const categories = categorizeAlerts(alerts);
  const topAlerts = alerts.slice(0, 10).map(a => ({
    event: a.event,
    severity: a.severity,
    area: a.area,
    startTime: a.startTime,
  }));

  const signals = [];
  if (categories.extreme > 0) signals.push(`🚨 EXTREME weather: ${categories.extreme} alerts`);
  if (categories.severe > 0) signals.push(`⚠️ SEVERE weather: ${categories.severe} alerts`);
  if (categories.byType.storms > 0) signals.push(`🌪️ Storms: ${categories.byType.storms} regions`);
  if (categories.byType.flooding > 0) signals.push(`💧 Flood risk: ${categories.byType.flooding} regions`);
  if (categories.byType.heat > 0) signals.push(`🌡️ Heat advisory: ${categories.byType.heat} regions`);

  return {
    source: 'DWD',
    timestamp: new Date().toISOString(),
    totalAlerts: categories.total,
    severityCounts: {
      extreme: categories.extreme,
      severe: categories.severe,
      moderate: categories.moderate,
    },
    byType: categories.byType,
    topAlerts,
    signals: signals.length > 0 ? signals : ['No severe weather alerts for Germany'],
  };
}
