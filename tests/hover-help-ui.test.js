'use strict';
require('../scripts/verify-hover-help').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
