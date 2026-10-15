'use strict';
require('../scripts/verify-lead-zero-counts').prove().catch(error => {console.error(error.stack); process.exitCode = 1;});
