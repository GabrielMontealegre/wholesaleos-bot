'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const brief=require('../modules/agents/operator-brief');
const now='2026-10-10T12:00:00.000Z';
const store={leads:[{owner_name:'PRIVATE OWNER',phone:'555-900-1111',address:'PRIVATE STREET',arv:9999999,spread:8888888}],buyers:[{assistant_find:{approval:'pending'}}],reviewed_deals:[],activities:[
 {ts:'2026-10-07T12:00:00Z',type:'message_sent',buyer_ref:'BUY-0001',channel:'facebook',summary:'PRIVATE OWNER'},
 {ts:'2026-10-09T12:00:00Z',type:'reply_received',buyer_ref:'BUY-0001',channel:'facebook'},
 {ts:'2026-10-06T12:00:00Z',type:'email_sent',buyer_ref:'BUY-0002',channel:'email'},
 {ts:'2026-10-11T12:00:00Z',type:'reply_received',buyer_ref:'BUY-0002',channel:'email'}]};
const original=JSON.stringify(store);const result=brief.buildOperatorBrief(store,{now});assert.equal(result.today,'2026-10-10');assert.equal(result.incoming.length,1);assert.equal(result.followups.length,1);assert.equal(result.pending.buyers,1);assert.equal(result.candidates.length,0);
for(const value of ['PRIVATE OWNER','PRIVATE STREET','555-900-1111','9999999','8888888'])assert.ok(!JSON.stringify(result).includes(value));assert.equal(JSON.stringify(store),original);
assert.equal(brief.dayAt('2026-10-10T06:59:00Z','America/Mazatlan'),'2026-10-09');assert.equal(brief.dayAt('2026-10-10T07:00:00Z','America/Mazatlan'),'2026-10-10');assert.throws(()=>brief.buildOperatorBrief(store,{}),/timestamp_invalid/);
assert.equal(brief.buildOperatorBrief({activities:[{ts:'2026-10-09T06:00:00Z',type:'email_sent',buyer_ref:'BUY-0003',channel:'email'}]},{now:'2026-10-10T14:00:00Z'}).followups.length,1,'two local calendar days, not a rolling 48-hour requirement');
const tied=[{ts:'2026-10-07T12:00:00Z',type:'email_sent',buyer_ref:'BUY-0004',channel:'email'},{ts:'2026-10-07T12:00:00Z',type:'reply_received',buyer_ref:'BUY-0004',channel:'email'}];for(const activities of [tied,tied.slice().reverse()]){const b=brief.buildOperatorBrief({activities},{now});assert.equal(b.incoming.length,0);assert.equal(b.followups.length,0);}
const saved={fetch:global.fetch,clock:Date.now,write:fs.writeFileSync};let calls=0;try{const forbidden=()=>{calls++;throw Error('side effect');};global.fetch=forbidden;Date.now=forbidden;fs.writeFileSync=forbidden;brief.buildOperatorBrief(store,{now});}finally{global.fetch=saved.fetch;Date.now=saved.clock;fs.writeFileSync=saved.write;}assert.equal(calls,0);
console.log('Operator brief foundation: injected local day, reported replies/followups, future exclusion, real-value-only candidates, privacy and purity passed.');
