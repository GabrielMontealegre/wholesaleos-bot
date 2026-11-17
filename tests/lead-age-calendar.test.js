'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../dashboard/index.html'),'utf8');
function declaration(name){const start=html.indexOf('function '+name+'(');assert(start>=0);const end=html.indexOf('\n}',start);assert(end>start);return html.slice(start,end+2);}
const now=Date.parse('2026-11-03T19:18:00Z');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let effects=0;const denied=()=>{effects++;throw Error('creation filter side effect');};
const context={Date:FixedDate,fetch:denied,localStorage:{setItem:denied},console:{log:denied}};
vm.createContext(context);
vm.runInContext(['leadCreatedText','leadCreationInstant','leadMatchesAge'].map(declaration).join('\n'),context);
const today=[{created_at:'2026-11-03T07:00:00Z'},{created_at:'2026-11-03T19:18:00.000Z'},
  {createdAt:now},{created:'2026-11-03T07:00:00.001Z'},{inserted_at:'2026-11-03T10:00:00Z'},
  {created:'2026-11-02',created_at:'2026-11-03T07:00:00Z'}];
const notToday=[{created_at:'2026-11-03T06:59:59.999Z'},{created_at:'2026-11-03T19:18:00.001Z'},
  {updated_at:'2026-11-03T19:00:00Z'},{created:'11/03/2026'},{created:'2026-11-03'},
  {created_at:'2026-02-30T12:00:00Z'},{created_at:'2026-11-03T19:18:00+00:00'},
  {created_at:'2026-11-03T19:18:00Z trailing'},{createdAt:String(now)},{createdAt:Infinity},
  {createdAt:now+0.1},{createdAt:-1},{},{created_at:'bad',created:'2026-11-03T07:00:00Z'},
  {created_at:0,created:'2026-11-03T07:00:00Z'},{created_at:false,created:'2026-11-03T07:00:00Z'},
  Object.create({created_at:'2026-11-03T07:00:00Z'}),null,[],
  {created:'2026-11-03',created_at:'2026-11-03T06:59:59Z'}];
const before=JSON.stringify({today,notToday});
for(const row of today)assert.equal(context.leadMatchesAge(row,'1'),true);
for(const row of notToday)assert.equal(context.leadMatchesAge(row,'1'),false);
for(const row of [...today,...notToday])assert.equal(context.leadMatchesAge(row,''),true,'Any Time preserves unknown and future records');
for(const days of [3,5,7,30,60,90]){
  assert.equal(context.leadMatchesAge({createdAt:now-days*86400000},String(days)),true);
  assert.equal(context.leadMatchesAge({createdAt:now-days*86400000-1},String(days)),false);
  assert.equal(context.leadMatchesAge({createdAt:now+1},String(days)),false);
  assert.equal(context.leadMatchesAge({created:'2026-11-03'},String(days)),false,'Day-only records cannot prove an exact rolling window');
}
for(const age of ['1junk','-1','1.5',NaN,Infinity,true,{},[]])assert.equal(context.leadMatchesAge(today[0],age),false);
assert.equal(JSON.stringify({today,notToday}),before);assert.equal(effects,0);
console.log('lead-age-calendar: actual active predicate UTC-7 midnight, precise metadata/epoch, old/future/ambiguous/missing/update-only/day-only, Any Time preservation, multi-day boundaries and no writes/network PASS');
