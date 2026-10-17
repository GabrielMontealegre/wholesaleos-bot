'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.wosErrorPrivacy=api;})(typeof window==='undefined'?{}:window,function(){
  const types=new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError','EvalError','AggregateError']);
  const files=new Set(['server.js','wos-error-tracking.js','wos-error-privacy.js','wos-today-workspace.js','wos-todays-deals.js','wos-public-deals.js','wos-desk-shell.js','wos-buyers-found.js','wos-notification-workspace.js','wos-list-filters.js','wos-panel-hygiene.js','wos-conversations.js','wos-record-activity.js']);
  function number(v){return Number.isSafeInteger(v)&&v>=0&&v<10000000?v:undefined;}
  function sanitizeEvent(event,hint){
    if(hint)hint.attachments=[];
    if(!event||event.type&&event.type!=='error')return null;
    const clean={level:'error',message:'Application error; free-text details withheld for privacy'};
    if(typeof event.event_id==='string'&&/^[a-f0-9]{32}$/i.test(event.event_id))clean.event_id=event.event_id;
    if(Number.isFinite(event.timestamp)&&event.timestamp>=0)clean.timestamp=event.timestamp;
    const values=event.exception?.values;
    if(Array.isArray(values))clean.exception={values:values.slice(0,5).map(value=>{
      const out={type:types.has(value?.type)?value.type:'Error',value:'Error details withheld for privacy'};
      if(Array.isArray(value?.stacktrace?.frames))out.stacktrace={frames:value.stacktrace.frames.slice(-40).map(frame=>{
        // Only checked-in code-shaped filenames; never URLs, local paths, source context or function text.
        const file=typeof frame?.filename==='string'?frame.filename.replace(/\\/g,'/').split(/[?#]/)[0].split('/').pop():'';
        const safe={filename:files.has(file)?file:'application.js'};
        for(const key of ['lineno','colno']){const n=number(frame?.[key]);if(n!==undefined)safe[key]=n;}
        return safe;
      })};return out;
    })};
    return clean;
  }
  function validDsn(value){try{const u=new URL(value);return u.protocol==='https:'&&!!u.hostname&&/^[a-f0-9]+$/i.test(u.username)&&!u.password&&/^\/\d+$/.test(u.pathname)&&!u.search&&!u.hash?u.href:'';}catch{return '';}}
  return{sanitizeEvent,validDsn};
});
