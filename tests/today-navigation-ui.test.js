'use strict';
require('../scripts/verify-today-navigation').prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
