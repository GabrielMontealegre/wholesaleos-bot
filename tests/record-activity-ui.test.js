'use strict';
const {probeProcessSpawn}=require('./helpers/process-capability');
(async()=>{if(!(await probeProcessSpawn()).available){console.log('SKIPPED: record UI proof requires process spawn');return;}await require('../scripts/verify-record-activity-ui').prove();})().catch(e=>{console.error(e.stack);process.exitCode=1;});
