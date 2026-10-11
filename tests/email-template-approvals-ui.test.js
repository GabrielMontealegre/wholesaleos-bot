'use strict';
require('../scripts/verify-email-template-approvals').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
