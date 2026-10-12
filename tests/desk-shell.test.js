'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../dashboard/wos-desk-shell.css'),'utf8');
const blocks=css.match(/:root[^{]*\{[^}]+\}/g).slice(0,2);
const luminance=color=>color.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
for(const block of blocks){const tokens=Object.fromEntries(Array.from(block.matchAll(/--([a-z-]+):\s*(#[a-f0-9]{6})/g),m=>[m[1],m[2]]));for(const [a,b] of [['ink','bg'],['ink','card'],['muted','card'],['link','card'],['primary-ink','primary'],['selection-ink','selection'],['good','good-bg'],['danger','danger-bg'],['ink','warn-bg']]){const la=luminance(tokens[a]),lb=luminance(tokens[b]);assert.ok((Math.max(la,lb)+.05)/(Math.min(la,lb)+.05)>=4.5,a+'/'+b+' AA contrast');}}
const source=fs.readFileSync(path.join(__dirname,'../dashboard/wos-desk-shell.js'),'utf8');assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\b/.test(source),'shell introduces no network');assert.ok(!/cookie|token|pin|sessionStorage/i.test(source),'theme preference has no credential access');
require('../scripts/verify-desk-shell').prove().catch(error=>{console.error(error.stack);process.exitCode=1;});
