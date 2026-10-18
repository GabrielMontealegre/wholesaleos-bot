'use strict';
(function(root){
  const reasons={
    CONNECTED:'Google accepted the saved Drive authorization. File sync and backups have not been checked.',
    DRIVE_CONFIGURATION_MISSING:'Drive authorization is not configured on this server.',
    DRIVE_AUTHORIZATION_EXPIRED:'Google rejected the saved authorization (invalid_grant). It may have expired or been revoked.',
    DRIVE_CLIENT_REJECTED:'Google rejected the app credentials (invalid_client).',
    DRIVE_SCOPE_MISSING:'Google reported insufficient Drive permissions (insufficientPermissions).',
    DRIVE_API_DISABLED:'Google reported that the Drive API is disabled for this project (accessNotConfigured).',
    DRIVE_AUTHORIZATION_REQUIRED:'Google returned 401. The saved authorization did not authenticate.',
    DRIVE_FORBIDDEN:'Google returned 403. Access was denied; a missing scope is not proven.',
    DRIVE_RATE_LIMITED:'Google returned a rate limit. No retry was made.',
    DRIVE_TIMEOUT:'The Drive connection check timed out. No retry was made.',
    DRIVE_UNAVAILABLE:'The Drive connection check failed. No safe, specific provider reason was available.'
  },allowed=['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GDRIVE_REFRESH_TOKEN'];
  function markup({data=null,busy=false,error=''}={}){
    const code=data?.code,known=Object.hasOwn(reasons,code),connected=known&&code==='CONNECTED'&&data.connected===true;
    const label=busy?'Checking connection':error?'Error':connected?'Connected':code==='DRIVE_CONFIGURATION_MISSING'?'Not connected':'Error';
    const reason=error||(known?reasons[code]:'Connection has not been checked.'),missing=Array.isArray(data?.missing)?allowed.filter(key=>data.missing.includes(key)):[];
    return '<section class="wos-drive-status" aria-label="Google Drive connection"><header><h2>Google Drive</h2><button type="button" data-drive-check title="Check saved Drive authorization only; no files changed"'+(busy?' disabled':'')+'>Check connection</button></header><p role="status" data-drive-state class="drive-state '+(connected?'drive-connected':'')+'">'+label+'</p><p data-drive-reason>'+reason+'</p>'+(missing.length?'<p>Missing server variables: <code>'+missing.join('</code>, <code>')+'</code>.</p>':'')+'<p>Gmail email access and the Codex Drive connection do not connect this dashboard to Drive.</p><details data-drive-guide><summary>How to connect</summary><ol><li>Use the existing Google app for this dashboard. Its owner must enable the Drive API and check its authorization settings.</li><li>Open <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer">Google OAuth Playground</a>. Choose its gear, then Use your own OAuth credentials. Enter the app client ID and secret there, not in this dashboard.</li><li>Review the Drive permissions requested by this app before authorizing. The existing backup feature uses the Drive scope. Only the owner approves access and exchanges the authorization code for a refresh token.</li><li>In the server\'s private variables, the owner sets <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code> and <code>GDRIVE_REFRESH_TOKEN</code>. Never paste their values in chat, screenshots or source code.</li><li>After the server applies those variables, return here and choose Check connection. Connected proves authorization, not a completed backup.</li></ol><p><a href="https://developers.google.com/identity/protocols/oauth2/web-server#offline" target="_blank" rel="noopener noreferrer">Google authorization guide</a> · <a href="https://developers.google.com/workspace/drive/api/guides/handle-errors" target="_blank" rel="noopener noreferrer">Google Drive error guide</a></p></details></section>';
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={markup,reasons};return;}
  let state={busy:false,data:null,error:''},sequence=0;
  function paint(){document.querySelectorAll('.wos-drive-status').forEach(el=>el.outerHTML=markup(state));}
  async function load(){
    if(!document.querySelector('.wos-drive-status'))return;
    const ticket=++sequence;state={busy:true,data:null,error:''};paint();
    try{const r=await fetch('/api/drive/status',{cache:'no-store'}),data=await r.json();if(ticket!==sequence)return;if(!r.ok){state={busy:false,data:null,error:r.status===401?'Dashboard login required.':r.status===403?'Admin access is required to check Drive.':'Connection check unavailable. Try again later.'};return;}if(!Object.hasOwn(reasons,data?.code)||typeof data.connected!=='boolean')throw Error();state={busy:false,data,error:''};}
    catch{if(ticket===sequence)state={busy:false,data:null,error:'Connection check unavailable. No files were changed.'};}
    finally{if(ticket===sequence)paint();}
  }
  function render(){++sequence;state={busy:true,data:null,error:''};setTimeout(load,0);return markup(state);}
  const settings=root.renderSettings;root.renderSettings=function(){return render()+settings.apply(this,arguments);};
  root.renderDrive=function(){return render();};
  root.checkDriveConnection=load;
  root.showDriveSetup=function(){const guide=document.querySelector('[data-drive-guide]');if(guide)guide.open=true;};
  root.connectGoogleDrive=root.showDriveSetup;
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){++sequence;state={busy:false,data:null,error:'Dashboard login required.'};paint();return signout.apply(this,arguments);};
  document.addEventListener('click',e=>{if(e.target.closest('[data-drive-check]')&&!state.busy)load();});
})(typeof window==='undefined'?{}:window);
