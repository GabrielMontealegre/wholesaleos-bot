'use strict';
require('../scripts/verify-reviewed-deal-clock').prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
