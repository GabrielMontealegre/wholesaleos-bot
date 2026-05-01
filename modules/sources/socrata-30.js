'use strict';
var fetch = require('node-fetch');
var db = require('../../db');

// 30 additional Socrata cities covering underserved states
var SOURCES = [
  // Pacific Northwest / Mountain West
  {city:'Portland',state:'OR',county:'Multnomah',domain:'data.portlandoregon.gov',dataset:'nwpr-km3v',addrF:'address',typeF:'case_type',label:'Portland OR Code Cases'},
  {city:'Spokane',state:'WA',county:'Spokane',domain:'my.spokanecity.org',dataset:'k4rm-jt9q',addrF:'site_address',typeF:'violation_type',label:'Spokane WA Code Violations'},
  {city:'Boise',state:'ID',county:'Ada',domain:'opendata.cityofboise.org',dataset:'m6qf-g6ji',addrF:'address',typeF:'violation',label:'Boise ID Code Violations'},
  {city:'Salt Lake City',state:'UT',county:'Salt Lake',domain:'opendata.slcgov.com',dataset:'xm7c-3m8k',addrF:'address',typeF:'case_type',label:'Salt Lake City UT Code Cases'},
  {city:'Albuquerque',state:'NM',county:'Bernalillo',domain:'data.cabq.gov',dataset:'ep9p-agsj',addrF:'address',typeF:'case_type',label:'Albuquerque NM Code Cases'},
  {city:'Tucson',state:'AZ',county:'Pima',domain:'gisdata.tucsonaz.gov',dataset:'kh9a-u8p6',addrF:'site_address',typeF:'case_subtype',label:'Tucson AZ Code Violations'},
  // Mid-Atlantic / Southeast
  {city:'Newark',state:'NJ',county:'Essex',domain:'data.newarknjusa.gov',dataset:'3v9z-p28q',addrF:'address',typeF:'violation_type',label:'Newark NJ Code Violations'},
  {city:'Trenton',state:'NJ',county:'Mercer',domain:'data.trentonnj.org',dataset:'9vdr-6kcc',addrF:'property_address',typeF:'violation',label:'Trenton NJ Code Violations'},
  {city:'Wilmington',state:'DE',county:'New Castle',domain:'data.wilmingtonde.gov',dataset:'nnvs-ychc',addrF:'address',typeF:'violation_type',label:'Wilmington DE Code Violations'},
  {city:'Norfolk',state:'VA',county:'Norfolk City',domain:'data.norfolk.gov',dataset:'xwge-v6kq',addrF:'address',typeF:'case_type',label:'Norfolk VA Code Cases'},
  {city:'Columbia',state:'SC',county:'Richland',domain:'data.columbiasc.net',dataset:'f3hb-u3q9',addrF:'address',typeF:'violation_type',label:'Columbia SC Code Violations'},
  {city:'Augusta',state:'GA',county:'Richmond',domain:'data.augustaga.gov',dataset:'bwm5-qrec',addrF:'address',typeF:'case_type',label:'Augusta GA Code Cases'},
  {city:'Jacksonville',state:'FL',county:'Duval',domain:'data.coj.net',dataset:'hxd5-k9qr',addrF:'site_address',typeF:'violation_code',label:'Jacksonville FL Code Violations'},
  // Midwest / Plains
  {city:'Oklahoma City',state:'OK',county:'Oklahoma',domain:'data.okc.gov',dataset:'n2uf-b2gs',addrF:'address',typeF:'case_type',label:'Oklahoma City OK Code Cases'},
  {city:'Tulsa',state:'OK',county:'Tulsa',domain:'opendata.cityoftulsa.org',dataset:'xpwk-3hpj',addrF:'address',typeF:'violation_type',label:'Tulsa OK Code Violations'},
  {city:'Little Rock',state:'AR',county:'Pulaski',domain:'data.littlerock.gov',dataset:'q7gh-5n6r',addrF:'address',typeF:'case_type',label:'Little Rock AR Code Cases'},
  {city:'Jackson',state:'MS',county:'Hinds',domain:'data.jacksonms.gov',dataset:'vmmq-9nzp',addrF:'address',typeF:'violation',label:'Jackson MS Code Violations'},
  {city:'Birmingham',state:'AL',county:'Jefferson',domain:'data.birminghamal.gov',dataset:'ge7n-bx3q',addrF:'address',typeF:'case_type',label:'Birmingham AL Code Cases'},
  {city:'Omaha',state:'NE',county:'Douglas',domain:'opendata.cityofomaha.org',dataset:'g5bk-7htb',addrF:'address',typeF:'case_type',label:'Omaha NE Code Cases'},
  {city:'Wichita',state:'KS',county:'Sedgwick',domain:'opendata.wichita.gov',dataset:'6b9s-mr2r',addrF:'address',typeF:'violation_type',label:'Wichita KS Code Violations'},
  {city:'Sioux Falls',state:'SD',county:'Minnehaha',domain:'opendata.siouxfalls.gov',dataset:'q7nk-3fhp',addrF:'address',typeF:'violation',label:'Sioux Falls SD Code Violations'},
  {city:'Fargo',state:'ND',county:'Cass',domain:'data.fargond.gov',dataset:'jb4h-kp8q',addrF:'site_address',typeF:'case_type',label:'Fargo ND Code Cases'},
  // New England
  {city:'Providence',state:'RI',county:'Providence',domain:'data.providenceri.gov',dataset:'bm6z-9fct',addrF:'address',typeF:'violation_type',label:'Providence RI Code Violations'},
  {city:'Hartford',state:'CT',county:'Hartford',domain:'data.hartford.gov',dataset:'4tpg-6qtx',addrF:'address',typeF:'case_type',label:'Hartford CT Code Cases'},
  {city:'New Haven',state:'CT',county:'New Haven',domain:'data.newhavenct.gov',dataset:'xpnk-2qwj',addrF:'address',typeF:'violation',label:'New Haven CT Code Violations'},
  {city:'Burlington',state:'VT',county:'Chittenden',domain:'data.burlingtonvt.gov',dataset:'3m8k-r7qp',addrF:'property_address',typeF:'case_type',label:'Burlington VT Code Cases'},
  {city:'Manchester',state:'NH',county:'Hillsborough',domain:'data.manchesternh.gov',dataset:'hq9n-6kbr',addrF:'address',typeF:'violation_type',label:'Manchester NH Code Violations'},
  {city:'Portland',state:'ME',county:'Cumberland',domain:'data.portlandmaine.gov',dataset:'kh7n-3qwp',addrF:'address',typeF:'case_type',label:'Portland ME Code Cases'},
  // Hawaii / Alaska (high-value markets)
  {city:'Honolulu',state:'HI',county:'Honolulu',domain:'data.honolulu.gov',dataset:'vb3q-9kms',addrF:'address',typeF:'case_type',label:'Honolulu HI Code Cases'},
  {city:'Anchorage',state:'AK',county:'Anchorage',domain:'data.muni.org',dataset:'p3bm-6qnk',addrF:'address',typeF:'violation_type',label:'Anchorage AK Code Violations'}
];

function scoreMotivation(row, src) {
  var score = 50;
  var reasons = [];
  var type = (row[src.typeF] || '').toLowerCase();
  if (type.indexOf('vacant') > -1 || type.indexOf('abandon') > -1) { score += 30; reasons.push('Vacant/Abandoned'); }
  if (type.indexOf('hazard') > -1 || type.indexOf('unsafe') > -1) { score += 20; reasons.push('Unsafe condition'); }
  if (type.indexOf('fire') > -1) { score += 25; reasons.push('Fire damaged'); }
  if (type.indexOf('blight') > -1) { score += 20; reasons.push('Blighted'); }
  if (type.indexOf('tax') > -1 || type.indexOf('lien') > -1) { score += 25; reasons.push('Tax delinquent'); }
  if (type.indexOf('demo') > -1) { score += 15; reasons.push('Demo order'); }
  return { score: Math.min(score, 100), reasons: reasons };
}

async function fetchSource(src, limit) {
  var leads = [];
  var offset = 0;
  var pageSize = 1000;
  while (leads.length < limit) {
    var fetchLimit = Math.min(pageSize, limit - leads.length);
    var url = 'https://' + src.domain + '/resource/' + src.dataset + '.json?$limit=' + fetchLimit + '&$offset=' + offset;
    var res;
    try { res = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 15000 }); }
    catch(e) { console.error('[socrata-30] ' + src.city + ' fetch: ' + e.message); break; }
    if (!res.ok) { console.error('[socrata-30] ' + src.city + ' HTTP ' + res.status); break; }
    var rows;
    try { rows = await res.json(); } catch(e) { break; }
    if (!rows || rows.length === 0) break;
    rows.forEach(function(row) {
      var addr = row[src.addrF] || row.address || row.Address || '';
      if (!addr || typeof addr !== 'string') return;
      var motivation = scoreMotivation(row, src);
      leads.push({
        address: addr,
        city: src.city,
        state: src.state,
        county: src.county,
        zip: row.zip || row.zip_code || '',
        source: 'socrata_30',
        source_details: src.label,
        lead_type: 'raw',
        analysisStatus: 'incomplete',
        arv: null,
        motivation: motivation.reasons.join('; ') || (row[src.typeF] || 'Code Violation'),
        violations: row[src.typeF] || 'Code Violation',
        motivation_score: motivation.score,
        good_deal_reasons: motivation.reasons,
        priority: motivation.score >= 75 ? 'HIGH' : motivation.score >= 55 ? 'MEDIUM' : 'LOW',
        phone: '',
        email: '',
        owner_name: row.owner_name || row.owner || ''
      });
    });
    if (rows.length < fetchLimit) break;
    offset += rows.length;
    if (leads.length >= limit) break;
  }
  return leads;
}

async function runSocrata30Sources(maxPerSource) {
  var total = 0; var inserted = 0;
  console.log('[socrata-30] starting ' + SOURCES.length + ' sources');
  for (var i = 0; i < SOURCES.length; i++) {
    var src = SOURCES[i];
    try {
      var leads = await fetchSource(src, maxPerSource || 200);
      console.log('[socrata-30] ' + src.city + ': ' + leads.length + ' leads');
      total += leads.length;
      for (var j = 0; j < leads.length; j++) {
        try { var r = db.addLead(leads[j]); if (r && r.id) inserted++; } catch(e) {}
      }
    } catch(e) { console.error('[socrata-30] ' + src.city + ' error: ' + e.message); }
  }
  console.log('[socrata-30] done. fetched=' + total + ' inserted=' + inserted);
  return { fetched: total, inserted: inserted };
}

module.exports = { runSocrata30Sources: runSocrata30Sources };
