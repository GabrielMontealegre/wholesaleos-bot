'use strict';
const { probeProcessSpawn } = require('./helpers/process-capability');
(async () => {
  if (!(await probeProcessSpawn()).available) { console.log('SKIPPED: lead-contact UI requires process spawn'); return; }
  await require('../scripts/verify-lead-contact-ui').prove();
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
