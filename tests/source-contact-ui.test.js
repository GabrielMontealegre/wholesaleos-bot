'use strict';
require('../scripts/verify-source-contact-ui').prove().catch(error => { console.error(error.stack); process.exitCode = 1; });
