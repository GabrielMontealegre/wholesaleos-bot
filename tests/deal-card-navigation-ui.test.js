'use strict';
require('../scripts/verify-deal-card-navigation').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
