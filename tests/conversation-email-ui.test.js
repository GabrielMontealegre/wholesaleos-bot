'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function main(){
  let handler;const panel={outerHTML:''},calls=[],timers=[];
  const plain={total:1,waiting_count:0,items:[{person:'SYNTHETIC',refs:[],status:'follow_up',what_they_said:'Reported',ready_message:'Old draft'}]};
  let payload={...plain,email_preview:{preview_only:true,scanned_messages:3,matched_messages:1,unlinked_messages:1,ambiguous_messages:1,invalid_messages:0},items:[{...plain.items[0],ready_message:'',email_subject:'<script>unsafe</script>',email_evidence:{captured_at:'2026-10-10T12:00:00Z'}}]},ok=true;
  const root={renderDashboard:()=>'<p>Old dashboard preserved</p>'};
  const doc={head:{appendChild(){}},createElement:()=>({}),querySelector:()=>panel,addEventListener:(type,fn)=>{handler=fn;}};
  const read=async(url,opts)=>{calls.push([url,opts?.method||'GET']);return {ok,json:async()=>url.endsWith('email-preview')?payload:plain};};
  vm.runInNewContext(fs.readFileSync('dashboard/wos-conversations.js','utf8'),{window:root,document:doc,URL,setTimeout:fn=>timers.push(fn),fetch:read});
  assert.equal(calls.length,0);assert.ok(root.renderDashboard().includes('Old dashboard preserved'));assert.equal(calls.length,0);
  await timers.shift()();assert.deepEqual(calls,[['/api/dashboard/conversations','GET']],'load never checks mailbox');
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const click=()=>handler({target:{closest:s=>s==='[data-conversation-email-preview]'?{}:null}});
  click();await flush();assert.ok(panel.outerHTML.includes('3 checked, 1 exactly linked'));assert.ok(panel.outerHTML.includes('&lt;script&gt;'));assert.ok(!panel.outerHTML.includes('<script>'));assert.ok(!panel.outerHTML.includes('Old draft'));assert.ok(panel.outerHTML.includes('Nothing saved'));
  ok=false;payload={secret:'private-password'};click();await flush();assert.ok(panel.outerHTML.includes('Email preview unavailable'));assert.ok(!panel.outerHTML.includes('private-password'));assert.ok(panel.outerHTML.includes('SYNTHETIC'),'failed refresh retains prior view');
  ok=true;payload={...plain,email_preview:{status:'No anchors. Nothing was fetched.',preview_only:true,scanned_messages:0,matched_messages:0,unlinked_messages:0}};click();await flush();assert.ok(panel.outerHTML.includes('Nothing was fetched'));
  assert.ok(calls.every(([,method])=>method==='GET'));
  console.log('Conversation email UI: explicit GET only, no auto mailbox reads, retained state/error redaction, escaped subject, stale draft withheld, no-anchor status passed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
