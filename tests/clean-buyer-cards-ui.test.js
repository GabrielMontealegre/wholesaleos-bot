'use strict';
require('../scripts/verify-clean-buyer-cards').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
