// modules/lead-validator.js
// Validation layer before addLead() in /api/leads/import
'use strict';

const STATE_ABBR = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
  'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
  'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

const PLACEHOLDER_RE = [
  /^(test|sample|demo|fake|n\/a|unknown|tbd|xxx|null|undefined|none)\s*$/i,
  /^(\.)\1{4,}$/
];

function isValidPhone(p) {
  if (!p) return true;
  var d = String(p).replace(/\D/g,'');
  return d.length === 10 || d.length === 11;
}

function isValidAddress(a) {
  if (!a || typeof a !== 'string') return false;
  var s = a.trim();
  if (s.length < 5) return false;
  for (var i=0;i<PLACEHOLDER_RE.length;i++) if (PLACEHOLDER_RE[i].test(s)) return false;
  return /^\d/.test(s);
}

function isValidState(s) {
  if (!s || typeof s !== 'string') return false;
  return STATE_ABBR.has(s.trim().toUpperCase());
}

function isValidCity(c) {
  if (!c || typeof c !== 'string') return false;
  var s = c.trim();
  if (s.length < 2) return false;
  for (var i=0;i<PLACEHOLDER_RE.length;i++) if (PLACEHOLDER_RE[i].test(s)) return false;
  return true;
}

// ZIP prefix -> allowed states (cross-contamination guard)
var ZIP_STATE = {
  '9':['CA','OR','WA','NV','AZ','AK','HI'],
  '7':['TX','OK','AR','LA'],
  '3':['FL','GA','AL','MS','TN','SC','NC'],
  '4':['OH','MI','IN','KY'],
  '6':['IL','MO','KS','NE','IA'],
  '1':['NY','NJ','CT','MA','RI','VT','NH','ME','PA','DE','MD'],
  '2':['VA','WV','NC','SC'],
  '8':['CO','NM','UT','WY','ID','MT'],
  '5':['MN','WI','SD','ND'],
  '0':['CT','MA','RI','VT','NH','ME','NJ','NY']
};

// URL fields are optional — if present must be a real http/https URL, not a placeholder
function isValidUrl(u) {
  if (!u) return true;
  var s = String(u).trim();
  if (s.length < 10) return false;
  for (var i=0;i<PLACEHOLDER_RE.length;i++) if (PLACEHOLDER_RE[i].test(s)) return false;
  return /^https?:\/\/.{4,}/.test(s);
}
function stateMatchesZip(state, zip) {
  if (!zip || !state) return true;
  var prefix = String(zip).trim()[0];
  var allowed = ZIP_STATE[prefix];
  if (!allowed) return true;
  return allowed.indexOf(state.trim().toUpperCase()) > -1;
}

/**
 * validateLead(lead, existingAddressSet)
 * @returns { valid: true } | { valid: false, reason: string }
 * existingAddressSet: Set of normalized addresses already in db
 */
function validateLead(lead, existingAddressSet) {
  var l = lead || {};

  var addr = (l.address || l.street_address || l.property_address || '').trim();
  if (!isValidAddress(addr)) return { valid:false, reason:'invalid_address:'+addr };

  var addrKey = addr.toLowerCase().replace(/\s+/g,' ');
  if (existingAddressSet && existingAddressSet.has(addrKey))
    return { valid:false, reason:'duplicate_address:'+addr };

  var state = (l.state || l.property_state || '').trim().toUpperCase();
  if (state && !isValidState(state)) return { valid:false, reason:'invalid_state:'+state };

  var city = (l.city || l.property_city || '').trim();
  if (city && !isValidCity(city)) return { valid:false, reason:'invalid_city:'+city };

  var zip = (l.zip || l.zipcode || l.postal_code || '').trim();
  if (state && zip && !stateMatchesZip(state, zip))
    return { valid:false, reason:'state_zip_mismatch:state='+state+' zip='+zip };

  var phone = l.phone || l.phone_number || l.owner_phone || '';
  if (!isValidPhone(phone)) return { valid:false, reason:'invalid_phone:'+phone };


  // 7. URL fields — if present must be valid http/https (optional fields)
  var urlFields = ['sourceUrl','photoUrl','zillowUrl','redfinUrl','streetViewUrl'];
  for (var ui=0;ui<urlFields.length;ui++) {
    var uf = urlFields[ui];
    if (l[uf] && !isValidUrl(l[uf]))
      return { valid:false, reason:'invalid_url:'+uf+'='+l[uf] };
  }
  return { valid:true };
}

module.exports = { validateLead };