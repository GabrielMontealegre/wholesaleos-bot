'use strict';
require('../scripts/verify-inbox-workspace').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
