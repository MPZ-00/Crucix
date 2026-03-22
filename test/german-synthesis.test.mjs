import { synthesize } from '../dashboard/inject.mjs';
import { fullBriefing } from '../apis/briefing.mjs';

const data = await fullBriefing();
console.log('Raw sources present:', Object.keys(data.sources || {}).filter(k => ['DWD', 'SMARD', 'Destatis', 'Eurostat', 'Nominatim'].includes(k)));

const D = await synthesize(data);
console.log('\nSynthesized German sources:');
console.log('DWD:', D.dwd ? { totalAlerts: D.dwd.totalAlerts, signals: D.dwd.signals?.length } : 'MISSING');
console.log('SMARD:', D.smard ? { renewable: D.smard.renewable?.toFixed(1), signals: D.smard.signals?.length } : 'MISSING');
console.log('Destatis:', D.destatis ? { cpi: D.destatis.cpi?.toFixed(2), signals: D.destatis.signals?.length } : 'MISSING');
console.log('Eurostat:', D.eurostat ? { signals: D.eurostat.signals?.length } : 'MISSING');
console.log('Nominatim:', D.nominatim ? { cacheEntries: D.nominatim.cacheEntries, signals: D.nominatim.signals?.length } : 'MISSING');
