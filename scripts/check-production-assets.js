'use strict';
const { checkProductionAssets } = require('../modules/security/production-assets');
checkProductionAssets();
console.log('Production public asset inventory: PASS');
