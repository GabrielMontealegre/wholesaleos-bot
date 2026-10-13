'use strict';
require('../scripts/verify-jv-desk').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
