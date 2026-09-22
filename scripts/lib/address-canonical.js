'use strict';

const SUFFIXES = Object.freeze({
  DR: 'DR', DRIVE: 'DR', ST: 'ST', STREET: 'ST', RD: 'RD', ROAD: 'RD',
  LN: 'LN', LANE: 'LN', AVE: 'AVE', AVENUE: 'AVE', BLVD: 'BLVD', BOULEVARD: 'BLVD',
  CT: 'CT', COURT: 'CT', CIR: 'CIR', CIRCLE: 'CIR', PL: 'PL', PLACE: 'PL',
  TRL: 'TRL', TRAIL: 'TRL', PKWY: 'PKWY', PARKWAY: 'PKWY', HWY: 'HWY', HIGHWAY: 'HWY',
  WAY: 'WAY', TER: 'TER', TERRACE: 'TER'
});
const DIRECTIONALS = Object.freeze({
  N: 'N', NORTH: 'N', S: 'S', SOUTH: 'S', E: 'E', EAST: 'E', W: 'W', WEST: 'W',
  NE: 'NE', NORTHEAST: 'NE', NW: 'NW', NORTHWEST: 'NW', SE: 'SE', SOUTHEAST: 'SE',
  SW: 'SW', SOUTHWEST: 'SW'
});
const UNIT_RE = /(?:\s|,)+(?:APT|APARTMENT|UNIT|STE|SUITE|#)\s*([A-Z0-9-]+)\s*$/i;

function normalizedText(value) {
  return String(value == null ? '' : value)
    .toUpperCase()
    .replace(/[.'’]/g, '')
    .replace(/[^A-Z0-9#,-]+/g, ' ')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeAddress(text) {
  let value = normalizedText(text);
  let unit = '';

  const zipMatch = value.match(/(?:\s|,)(\d{5})(?:-\d{4})?$/);
  const zip = zipMatch ? zipMatch[1] : '';
  if (zipMatch) value = value.slice(0, zipMatch.index).trim().replace(/,+$/, '');

  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  let state = '';
  let city = '';
  let streetPart = parts[0] || '';
  if (parts.length >= 3) {
    state = parts.pop();
    city = parts.pop();
    streetPart = parts.join(' ');
  } else if (parts.length === 2) {
    const tail = parts[1].match(/^(.+?)\s+([A-Z]{2})$/);
    if (tail) { city = tail[1].trim(); state = tail[2]; }
    else city = parts[1];
  } else {
    const fullTail = streetPart.match(/^(.*?)(?:\s+)([A-Z][A-Z ]+?)\s+([A-Z]{2})$/);
    if (fullTail && /^\d+\s/.test(fullTail[1])) {
      streetPart = fullTail[1]; city = fullTail[2]; state = fullTail[3];
    }
  }

  const unitMatch = streetPart.match(UNIT_RE);
  if (unitMatch) {
    unit = unitMatch[1];
    streetPart = streetPart.slice(0, unitMatch.index).trim().replace(/,+$/, '');
  }

  const tokens = streetPart.split(/\s+/).filter(Boolean);
  const number = /^\d+[A-Z]?$/.test(tokens[0] || '') ? tokens.shift() : '';
  let suffix = '';
  let directional = '';
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!suffix && SUFFIXES[token]) { suffix = SUFFIXES[token]; tokens.splice(index, 1); continue; }
    if (!directional && DIRECTIONALS[token]) { directional = DIRECTIONALS[token]; tokens.splice(index, 1); }
  }
  const street = tokens.join(' ');
  state = state.replace(/[^A-Z]/g, '').slice(0, 2);
  city = city.replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const canonical = [number, directional, street, suffix, unit ? `UNIT ${unit}` : '', city, state, zip].filter(Boolean).join('|');
  return { number, street, suffix, directional, unit, city, state, zip, canonical_string: canonical };
}

function addressesMatchExactly(left, right) {
  const a = typeof left === 'string' ? canonicalizeAddress(left) : left || {};
  const b = typeof right === 'string' ? canonicalizeAddress(right) : right || {};
  const required = ['number', 'street', 'suffix', 'city', 'state', 'zip'];
  if (required.some((field) => !a[field] || !b[field] || a[field] !== b[field])) return false;
  if ((a.directional || '') !== (b.directional || '')) return false;
  return (a.unit || '') === (b.unit || '');
}

module.exports = { SUFFIXES, DIRECTIONALS, canonicalizeAddress, addressesMatchExactly };
