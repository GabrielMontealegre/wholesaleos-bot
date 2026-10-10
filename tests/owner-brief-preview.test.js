'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
async function main(){let handler,panel={outerHTML:''},calls=[];
let response={ok:true,json:async()=>({text:'Fixture <script>not executable</script>'})};
const root={renderSettings:()=>'<p>existing settings</p>'};
vm.runInNewContext(fs.readFileSync('dashboard/wos-owner-channel.js','utf8'),{window:root,document:{querySelector:()=>panel,addEventListener:(type,fn)=>{handler=fn;}},setTimeout:()=>{},fetch:async(url,options)=>{calls.push({url,method:options?.method||'GET'});return response;}});
assert.equal(calls.length,0);assert.ok(root.renderSettings().includes('existing settings'));assert.equal(calls.length,0,'render never requests or sends a briefing automatically');
const click=()=>handler({target:{closest:s=>s==='[data-owner-brief-preview]'?{}:null}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
click();await flush();assert.ok(panel.outerHTML.includes('&lt;script&gt;'));assert.ok(!panel.outerHTML.includes('<script>'));assert.deepEqual(calls,[{url:'/api/dashboard/operator-brief',method:'GET'}]);
for(const value of [{ok:false,json:async()=>({text:'private-test-secret'})},{ok:true,json:async()=>({token:'private-test-secret'})},{ok:true,json:async()=>({text:'x'.repeat(20001)})},{ok:true,json:async()=>{throw Error('private-test-secret');}}]){response=value;click();await flush();assert.ok(panel.outerHTML.includes('Briefing unavailable'));assert.ok(!panel.outerHTML.includes('private-test-secret'));}
let release;response={ok:true,json:()=>new Promise(resolve=>{release=resolve;})};const before=calls.length;click();await flush();click();assert.equal(calls.length,before+1,'busy guard prevents duplicate reads');release({text:'Fixture brief'});await flush();assert.ok(calls.every(r=>r.method==='GET'&&r.url==='/api/dashboard/operator-brief'));
console.log('Brief preview: explicit GET only, no automatic read/send, duplicate guard, escaped text, invalid/oversized/error response redaction passed.');}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
