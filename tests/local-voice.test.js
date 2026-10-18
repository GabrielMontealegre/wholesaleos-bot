'use strict';
const assert=require('node:assert/strict'),{createController}=require('../dashboard/wos-local-voice');
(async()=>{
 let starts=0,aborts=0,checks=0,spoken=[],state='available',timer,instance,pending;
 class Recognition{static async available(options){checks++;assert.deepEqual(options,{langs:[options.langs[0]],processLocally:true});return pending?await pending:state;}start(){starts++;instance=this;}abort(){aborts++;}}
 Recognition.prototype.processLocally=false;
 const host={SpeechRecognition:Recognition,Event:class{constructor(type,options){this.type=type;this.bubbles=options.bubbles;}},setTimeout:(fn,delay)=>{assert.equal(delay,60000);timer=fn;return 1;},clearTimeout:()=>{},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{cancel:()=>{},getVoices:()=>[{lang:'en-US',localService:false},{lang:'es-MX',localService:true}],speak:u=>spoken.push(u)}};
 const controller=createController(host),messages=[],status=s=>messages.push(s);
 function field(value='Hello '){return {value,selectionStart:value.length,selectionEnd:value.length,maxLength:20,isConnected:true,readOnly:false,disabled:false,events:[],dispatchEvent(e){this.events.push(e.type);}};}
 const target=field();assert.equal(starts,0);assert.equal(controller.supported(),true);
 assert.equal(await controller.dictate({lang:'en-US',target,status}),true);assert.equal(starts,1);assert.equal(instance.processLocally,true);assert.equal(instance.lang,'en-US');assert.equal(instance.continuous,false);
 const result=(text,final)=>{const item=[{transcript:text}];item.isFinal=final;return item;};
 instance.onresult({results:[result('unfinished',false)]});assert.equal(target.value,'Hello ');assert.deepEqual(target.events,[]);assert.ok(messages.at(-1).includes('unfinished'));
 instance.onresult({results:[result('world',true)]});assert.equal(target.value,'Hello world');assert.deepEqual(target.events,['input']);
 instance.onresult({results:[result('123456789012345678901234',true)]});assert.equal(target.value.length,20,'field max is retained');
 const old=instance;controller.cancel();const before=target.value;old.onresult({results:[result('stale',true)]});assert.equal(target.value,before);
 const second=field();await controller.dictate({lang:'es-MX',target:second,status});const current=instance;old.onresult({results:[result('stale',true)]});assert.equal(controller.target(),second,'old event cannot cancel new session');timer();assert.equal(controller.target(),undefined);assert.ok(aborts>=2);
 for(const value of ['unavailable','downloadable','downloading']){state=value;const beforeStarts=starts;assert.equal(await controller.dictate({lang:'es-MX',target:field(),status}),false);assert.equal(starts,beforeStarts);}
 state='available';for(const target of [{...field(),readOnly:true},{...field(),disabled:true},{...field(),isConnected:false}]){const before=checks;assert.equal(await controller.dictate({lang:'en-US',target,status}),false);assert.equal(checks,before);}
 assert.equal(await controller.dictate({lang:'forged',target:field(),status}),false);
 const deferred=field();let resolve;pending=new Promise(r=>resolve=r);const running=controller.dictate({lang:'en-US',target:deferred,status});controller.cancel();const beforeStarts=starts;resolve('available');assert.equal(await running,false);assert.equal(starts,beforeStarts);pending=null;
 await controller.dictate({lang:'en-US',target:field(),status});instance.onerror({error:'not-allowed PRIVATE_INTERNAL'});assert.ok(!messages.at(-1).includes('PRIVATE_'));assert.equal(controller.target(),undefined);
 assert.equal(controller.read({lang:'en-US',text:'Synthetic draft',status}),false,'remote voices never used');assert.equal(spoken.length,0);
 assert.equal(controller.read({lang:'es-MX',text:'Synthetic draft',status}),true);assert.equal(spoken.length,1);assert.equal(spoken[0].voice.localService,true);
 const legacy=createController({...host,SpeechRecognition:undefined,webkitSpeechRecognition:Recognition});assert.equal(legacy.supported(),false);assert.equal(await legacy.dictate({lang:'en-US',target:field(),status}),false);
 const saved=global.fetch;let network=0;global.fetch=()=>{network++;throw Error('unexpected network');};try{assert.equal(await legacy.dictate({lang:'en-US',target:field(),status}),false);assert.equal(network,0);}finally{global.fetch=saved;}
 assert.ok(current);console.log('Local voice: no start on load, explicit on-device flag/language check, no prefixed/cloud fallback/install, editable final-only drafts/max length, stale events/new sessions, cancel/deadline/denial, no remote TTS/autosend/network passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
