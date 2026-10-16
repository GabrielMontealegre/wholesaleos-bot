'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dashboard/wos-panel-hygiene.js'),'utf8');
assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test(source),'presentation closing has no network, persistence or credential reader');
require('../scripts/verify-panel-hygiene').prove().catch(e=>{console.error(e.stack);process.exitCode=1;});
