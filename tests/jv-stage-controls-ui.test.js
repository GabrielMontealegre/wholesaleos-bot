'use strict';
require('../scripts/verify-jv-stage-controls').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
