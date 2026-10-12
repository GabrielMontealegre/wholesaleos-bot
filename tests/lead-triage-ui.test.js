'use strict';
require('../scripts/verify-lead-triage').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
