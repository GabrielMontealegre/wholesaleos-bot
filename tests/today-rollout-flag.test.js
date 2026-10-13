'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const flag=fs.readFileSync(path.resolve(__dirname,'../dashboard/wos-feature-flags.js'),'utf8');
const bundle=fs.readFileSync(path.resolve(__dirname,'../dashboard/wos-today-workspace.js'),'utf8');
for(const state of [undefined,false,'true',1]){
  let calls=0;const original=()=> 'baseline';const window={wosDashboardFeatures:{todayActionCenter:state},renderDashboard:original};
  vm.runInNewContext(bundle,{window,fetch:()=>{calls++;throw Error('no network');},setTimeout:()=>{calls++;},document:new Proxy({},{get(){calls++;throw Error('no DOM access');}})});
  assert.equal(window.renderDashboard,original);assert.equal(calls,0);assert.ok(window.wosTodayWorkspace);
}
const window={};vm.runInNewContext(flag,{window});assert.equal(window.wosDashboardFeatures.todayActionCenter,true,'activation only after staged exact-head dashboard200; invalid/off flags still preserve baseline');assert.ok(Object.isFrozen(window.wosDashboardFeatures));
const route=fs.readFileSync(path.resolve(__dirname,'../modules/records/conversation-routes.js'),'utf8');
assert.ok(route.includes("require('../agents/verified-ui-releases.json')"));assert.ok(!route.includes('data/verified-ui-releases'));
assert.ok(fs.existsSync(path.resolve(__dirname,'../modules/agents/verified-ui-releases.json')));
console.log('Default-off flag leaves baseline renderer untouched with zero DOM/network; strict boolean opt-in, immutable flag, release metadata outside mutable data passed.');
async function cancellation(){
  let resolve,originalCalls=0;const paints=[],timers=[];
  const panel={set outerHTML(value){paints.push(value);},querySelectorAll:()=>[],querySelector:()=>({hidden:false})};
  const document={getElementById:id=>id==='wos-today-workspace'?panel:null,addEventListener(){}};
  const window={wosDashboardFeatures:{todayActionCenter:true},renderConversationTools:()=>'',signOutDashboard:()=>{originalCalls++;}};
  vm.runInNewContext(bundle,{window,document,Date,setTimeout:callback=>timers.push(callback),fetch:()=>new Promise(done=>{resolve=done;})});
  window.renderDashboard();const pending=timers.shift()();window.signOutDashboard();
  resolve({ok:true,json:async()=>({source_kind:'derived_workflow',now:'2026-10-13T12:00:00Z',actions:[{label:'PRIVATE AFTER LOGOUT'}],best_deals:[],last_24h:[],counts:{replies:1,approvals:0,followups:0,deadlines:0}})});
  await pending;assert.equal(originalCalls,1);assert.ok(!paints.join('').includes('PRIVATE AFTER LOGOUT'));
  console.log('Enabled Today pending response cancelled on sign-out; existing sign-out called unchanged and no private repaint.');
}
cancellation().catch(error=>{console.error(error.stack);process.exitCode=1;});
