'use strict';
require('../scripts/verify-jv-signing-review').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
