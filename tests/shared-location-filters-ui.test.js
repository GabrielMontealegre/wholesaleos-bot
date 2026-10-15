'use strict';
require('../scripts/verify-shared-location-filters').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
