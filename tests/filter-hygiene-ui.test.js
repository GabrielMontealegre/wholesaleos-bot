'use strict';
require('../scripts/verify-filter-hygiene').prove().catch(error => {console.error(error.stack); process.exitCode = 1;});
