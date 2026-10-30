'use strict';
(function(root){
  const SELECTOR=[
    'textarea[data-email-reply]','textarea[data-deal-draft]','textarea[data-draft]','textarea[data-conversation-draft]','textarea[data-ask-query]',
    '#wosEmailBody','#wosSmsBody','#wosCallNotes','#email-template-library textarea[name="body"]',
    'textarea[id^="lead-notes-"]','textarea[id^="deal-call-notes-"]','textarea[id^="msg-sms-"]','textarea[id^="msg-email-"]',
    '#evt-notes','#ml-notes','#mb-notes','#email-body','#bulk-sms-body','#ise-body','#iss-body','#intro-email-body',
    '#ao-email-body','#ao-sms-body','#or-sms-body','#or-email-body','#or-buyer-email','#or-buyer-sms'
  ].join(',');
  const LANGS=['en-US','es-MX'];
  function createController(host){
    let active=null,generation=0;
    function cancel(){generation++;if(active){const item=active;active=null;host.clearTimeout(item.timer);try{item.recognition.abort();}catch{}item.status('Dictation stopped. Review your draft.');}host.speechSynthesis?.cancel();}
    function localConstructor(){const C=host.SpeechRecognition;return typeof C==='function'&&typeof C.available==='function'&&'processLocally' in C.prototype?C:null;}
    async function dictate({lang,target,status}){
      cancel();const ticket=generation,C=localConstructor();
      if(!LANGS.includes(lang)||!C){status('On-device dictation is unavailable. Type, or use a keyboard microphone only if its privacy settings suit you.');return false;}
      if(target.readOnly||target.disabled||!target.isConnected){status('This field is not editable.');return false;}
      status('Checking on-device language support...');
      let available;try{available=await C.available({langs:[lang],processLocally:true});}catch{status('On-device language check failed. No cloud fallback was used.');return false;}
      if(ticket!==generation||!target.isConnected)return false;
      if(available!=='available'){status('On-device '+(lang==='es-MX'?'Spanish':'English')+' is not installed or supported. Type instead; no language pack or audio was uploaded.');return false;}
      let recognition;
      try{
        recognition=new C();recognition.processLocally=true;
        if(recognition.processLocally!==true)throw Error();
        recognition.lang=lang;recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=1;
        const original=target.value,start=Number.isInteger(target.selectionStart)?target.selectionStart:original.length,end=Number.isInteger(target.selectionEnd)?target.selectionEnd:start;
        let finalText='';
        active={recognition,status,target};
        recognition.onresult=event=>{
          if(ticket!==generation||active?.recognition!==recognition)return;
          if(!target.isConnected||target.disabled||target.readOnly){cancel();return;}
          let text='',interim='';
          for(let i=0;i<event.results.length;i++){const r=event.results[i],part=r?.[0]?.transcript;if(typeof part!=='string')continue;if(r.isFinal===true)text+=part;else interim+=part;}
          const limit=target.maxLength>0?target.maxLength:4000;
          finalText=text.slice(0,Math.max(0,limit-(original.length-(end-start))));
          target.value=original.slice(0,start)+finalText+original.slice(end);
          if(text)target.dispatchEvent(new host.Event('input',{bubbles:true}));
          status(interim?'Listening: '+interim.slice(0,200):'Draft updated. Review before sending.');
        };
        recognition.onerror=event=>{if(ticket===generation){cancel();status(event.error==='not-allowed'?'Microphone permission was not granted. Nothing was sent.':'On-device dictation stopped. Review your draft; no cloud fallback was used.');}};
        recognition.onend=()=>{if(ticket===generation&&active?.recognition===recognition){host.clearTimeout(active.timer);active=null;status(finalText?'Dictation finished. Review your draft.':'No final speech was recognized. Draft unchanged.');}};
        active.timer=host.setTimeout(()=>{if(active?.recognition===recognition)cancel();},60000);recognition.start();status('Listening on this device. Nothing is sent.');return true;
      }catch{cancel();status('On-device dictation could not start. No cloud fallback was used.');return false;}
    }
    function read({lang,text,status}){
      cancel();if(!LANGS.includes(lang)||!host.speechSynthesis||!host.SpeechSynthesisUtterance){status('Read aloud is unavailable.');return false;}
      let voice;try{voice=host.speechSynthesis.getVoices().find(v=>v.localService===true&&v.lang?.split('-')[0]===lang.split('-')[0]);}catch{status('On-device voice check failed.');return false;}
      if(!voice){status('No on-device voice is available for this language. Nothing was read aloud.');return false;}
      if(typeof text!=='string'||!text.trim()){status('There is no draft to read.');return false;}
      try{const utterance=new host.SpeechSynthesisUtterance(text.slice(0,4000));utterance.voice=voice;utterance.lang=lang;host.speechSynthesis.speak(utterance);status('Reading on this device. Stop to silence it.');return true;}catch{status('On-device read aloud failed. No remote voice was used.');return false;}
    }
    return {dictate,read,cancel,supported:()=>!!localConstructor(),target:()=>active?.target};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={createController,SELECTOR};return;}
  const controller=createController(root),targets=new WeakMap();let scanning=false;
  function attach(){
    document.querySelectorAll(document.documentElement.dataset.wosWorkspace==='preview'?'textarea[data-ask-query]':SELECTOR).forEach(target=>{
      if(targets.has(target))return;
      const bar=document.createElement('div');bar.className='wos-voice-tools';
      bar.innerHTML='<div><label>Voice language<select data-voice-lang aria-label="Voice language"><option value="en-US">English</option><option value="es-MX">Espa\u00f1ol</option></select></label>'+(target.readOnly?'':'<button type="button" data-voice-dictate title="Dictate on this device only; review before sending" aria-label="Dictate on this device">\uD83C\uDF99</button>')+'<button type="button" data-voice-read title="Read this draft using an on-device voice only">Read aloud</button><button type="button" data-voice-stop title="Stop dictation and read aloud">Stop</button></div><p role="status" data-voice-status></p>';
      targets.set(target,bar);bar._voiceTarget=target;(target.closest('label')||target).insertAdjacentElement('afterend',bar);
      bar.querySelector('[data-voice-lang]').value=root.navigator.language?.startsWith('es')?'es-MX':'en-US';
      if(!controller.supported()){const b=bar.querySelector('[data-voice-dictate]');if(b){b.disabled=true;bar.querySelector('[data-voice-status]').textContent='On-device dictation is unavailable. Type, or check your keyboard microphone privacy settings.';}}
    });
    const target=controller.target();if(target&&!target.isConnected)controller.cancel();
  }
  document.addEventListener('click',e=>{const button=e.target.closest('[data-voice-dictate],[data-voice-read],[data-voice-stop]');if(!button)return;e.preventDefault();const bar=button.closest('.wos-voice-tools'),target=bar._voiceTarget,status=text=>{bar.querySelector('[data-voice-status]').textContent=text;},lang=bar.querySelector('[data-voice-lang]').value;
    if(button.hasAttribute('data-voice-stop')){controller.cancel();status('Voice stopped.');}
    else if(button.hasAttribute('data-voice-read'))controller.read({lang,text:target.value,status});
    else controller.dictate({lang,target,status});
  });
  document.addEventListener('input',e=>{if(e.isTrusted&&e.target===controller.target())controller.cancel();});
  document.addEventListener('change',e=>{if(e.target.matches('[data-voice-lang]'))controller.cancel();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)controller.cancel();});
  root.addEventListener('pagehide',()=>controller.cancel());
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){controller.cancel();return signout.apply(this,arguments);};
  new MutationObserver(()=>{if(!scanning){scanning=true;queueMicrotask(()=>{scanning=false;attach();});}}).observe(document.body,{childList:true,subtree:true});attach();
  root.wosLocalVoice={cancel:controller.cancel};
})(typeof window==='undefined'?{}:window);
