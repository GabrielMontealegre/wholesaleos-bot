'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dashboardPath = path.resolve(__dirname, '..', 'dashboard', 'index.html');
const html = fs.readFileSync(dashboardPath, 'utf8');
const start = html.indexOf('function renderCommandBuyers');
const end = html.indexOf('renderBuyers = renderCommandBuyers;', start);
assert.ok(start >= 0 && end > start, 'renderCommandBuyers block should be found');

const warnings = [];
const context = {
  APP: {
    buyers: [],
    buyboxes: [],
    buyboxRecommendations: [],
    leads: []
  },
  BUYER_LIST_FILTER: '',
  console: { warn: (message) => warnings.push(message) },
  loadMatchingData: () => Promise.resolve(),
  commandIsVerifiedBuyer: () => true,
  commandIsTemplateBuyBox: () => false,
  buyerMatchesFilter: () => true,
  dealCallSafeText: (value) => String(value == null ? '' : value),
  dealCallPill: (label) => String(label),
  matchBuyersToLead: () => []
};

vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

function renderWithBuyboxes(value) {
  context.APP.buyboxes = value;
  context.APP._buyersBuyBoxesLoading = true;
  return context.renderCommandBuyers();
}

assert.doesNotThrow(() => renderWithBuyboxes([]), 'array buyboxes should render');
assert.doesNotThrow(() => renderWithBuyboxes(null), 'null buyboxes should render');
assert.doesNotThrow(() => renderWithBuyboxes(undefined), 'undefined buyboxes should render');
assert.doesNotThrow(() => renderWithBuyboxes({ box_1: { active: true } }), 'object buyboxes should render');
assert.ok(renderWithBuyboxes({ box_1: { active: true } }).includes('Buy box data shape warning'), 'malformed buyboxes should show warning');
assert.ok(warnings.includes('Dashboard buy boxes ignored: expected array.'), 'malformed buyboxes should log non-secret warning');

console.log('dashboard boxes filter guard tests passed');
