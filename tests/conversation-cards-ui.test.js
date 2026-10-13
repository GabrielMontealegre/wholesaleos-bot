'use strict';
require('../scripts/verify-conversation-cards').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
