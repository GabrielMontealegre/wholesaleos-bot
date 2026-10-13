'use strict';
const {probeProcessSpawn}=require('./helpers/process-capability');
const {prove}=require('../scripts/verify-today-workspace');
(async()=>{
  if(!(await probeProcessSpawn()).available){console.log('SKIPPED: Today browser proof requires process spawn');return;}
  await prove();
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
