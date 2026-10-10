'use strict';
require('../scripts/verify-marketplace-ui').prove({wider:true}).catch(error=>{console.error(error.stack);process.exitCode=1;});
