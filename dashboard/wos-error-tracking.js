'use strict';
(function(root){
  let requested=false;
  async function start(){
    if(requested||!root.APP?.unlocked||root.APP.currentUser?.role!=='admin')return;
    requested=true;
    try{
      const response=await fetch('/api/dashboard/error-tracking-config',{cache:'no-store'});
      if(!response.ok)return;const config=await response.json(),dsn=root.wosErrorPrivacy.validDsn(config.dsn);
      if(config.enabled!==true||!dsn||!root.APP?.unlocked||root.APP.currentUser?.role!=='admin')return;
      const script=document.createElement('script');script.src='https://browser.sentry-cdn.com/10.22.0/bundle.min.js';script.crossOrigin='anonymous';
      script.onload=()=>{
        if(!root.APP?.unlocked||root.APP.currentUser?.role!=='admin'||!root.Sentry)return;
        root.Sentry.init({dsn,defaultIntegrations:false,integrations:[],sendDefaultPii:false,autoSessionTracking:false,tracesSampleRate:0,enableLogs:false,beforeSend:root.wosErrorPrivacy.sanitizeEvent,beforeSendTransaction:()=>null,beforeBreadcrumb:()=>null});
        root.addEventListener('error',event=>{if(root.APP?.unlocked)root.Sentry.captureException(event.error||new Error('Browser error'));});
        root.addEventListener('unhandledrejection',event=>{if(root.APP?.unlocked)root.Sentry.captureException(event.reason);});
      };
      document.head.appendChild(script);
    }catch{/* Monitoring must never block the dashboard. */}
  }
  // React to existing rendering/auth changes, never create another login or session.
  new MutationObserver(start).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  start();
})(window);
