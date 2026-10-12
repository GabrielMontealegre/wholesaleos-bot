'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function run(){
 const callbacks={},timers=[],calls=[],panel={outerHTML:''};let resolveFirst;
 const document={head:{appendChild(){}},createElement:()=>({}),querySelector:()=>panel,addEventListener:(type,fn)=>{callbacks[type]=fn;}};
 const window={renderSettings:()=>''};
 const fetch=async url=>{calls.push(url);if(calls.length===1)return new Promise(resolve=>{resolveFirst=resolve;});return {ok:true,json:async()=>({ok:true,messages:[{id:'fresh',subject:'NEW SESSION',from:'Fixture'}]})};};
 vm.runInNewContext(fs.readFileSync('dashboard/wos-email-reader.js','utf8'),{window,document,setTimeout:fn=>timers.push(fn),fetch});
 window.renderGmail();const old=timers.shift()();await new Promise(resolve=>setImmediate(resolve));
 window.renderGmail();await timers.shift()();assert.ok(panel.outerHTML.includes('NEW SESSION'));
 resolveFirst({ok:true,json:async()=>({ok:true,messages:[{id:'stale',subject:'OLD PRIVATE MAIL',from:'Old role'}]})});await old;
 assert.ok(!panel.outerHTML.includes('OLD PRIVATE MAIL'));assert.ok(panel.outerHTML.includes('NEW SESSION'),'old response cannot replace the new view');
 const click=selector=>callbacks.click({target:{closest:s=>s===selector?{}:null}});
 const before=calls.length;await click('[data-email-send]');assert.equal(calls.length,before,'disabled send even from a synthetic dispatched event is inert');
 const errors={},errorPanel={outerHTML:''},errorTimers=[];
 const failedDoc={...document,querySelector:()=>errorPanel,addEventListener:(type,fn)=>{errors[type]=fn;}};
 const failedRoot={renderSettings:()=>''};
 vm.runInNewContext(fs.readFileSync('dashboard/wos-email-reader.js','utf8'),{window:failedRoot,document:failedDoc,setTimeout:fn=>errorTimers.push(fn),fetch:async()=>{throw Error('PRIVATE TOKEN RAW SERVER ERROR');}});
 failedRoot.renderGmail();await errorTimers.shift()();assert.ok(!errorPanel.outerHTML.includes('PRIVATE TOKEN'));assert.ok(errorPanel.outerHTML.includes('Email unavailable'));
 const noteCallbacks={},noteTimers=[],notePanel={outerHTML:''};let denied=false;
 const noteRoot={renderSettings:()=>''},noteDoc={...document,querySelector:()=>notePanel,addEventListener:(type,fn)=>{noteCallbacks[type]=fn;}};
 vm.runInNewContext(fs.readFileSync('dashboard/wos-email-reader.js','utf8'),{window:noteRoot,document:noteDoc,setTimeout:fn=>noteTimers.push(fn),fetch:async url=>({ok:!denied,status:denied?401:200,json:async()=>denied?{code:'auth_required'}:url.includes('/conversations')?{items:[{person:'PRIVATE NOTE PERSON',role:'buyer',next_step:'Private reported step'}]}:{ok:true,messages:[]}})});
 noteRoot.renderGmail();await noteTimers.shift()();await noteCallbacks.click({target:{closest:s=>s==='[data-email-folder]'?{dataset:{emailFolder:'notes'}}:null}});assert.ok(notePanel.outerHTML.includes('PRIVATE NOTE PERSON'));
 denied=true;await noteCallbacks.click({target:{closest:s=>s==='[data-email-test]'?{}:null}});assert.ok(!notePanel.outerHTML.includes('PRIVATE NOTE PERSON'));assert.ok(notePanel.outerHTML.includes('Sign in to the dashboard'),'auth loss is not misreported as a bad mailbox password');
 console.log('Inbox UI state: cancelled old-session response cannot repaint private mail, disabled Send inert, unsafe network exception redacted passed.');
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
