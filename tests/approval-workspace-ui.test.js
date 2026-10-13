'use strict';
const {probeProcessSpawn}=require('./helpers/process-capability');
(async()=>{if(!(await probeProcessSpawn()).available){console.log('SKIPPED: approval browser proof requires process spawn');return;}await require('../scripts/verify-approval-workspace').prove();})().catch(e=>{console.error(e.stack);process.exitCode=1;});
