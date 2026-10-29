'use strict';
(function(root){
  const fields=['legal_name','llc','email','phone','mailing_address','typed_signature','signature_image'];
  let state={version:null,profile:null,busy:false,message:''},sequence=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actor=()=>root.APP?.unlocked&&root.APP?.currentUser?.id;
  const icon=name=>'<img class="wos-control-icon" src="/dashboard/workspace/vendor/lucide-1.60.0/'+name+'.svg" width="20" height="20" alt="" aria-hidden="true">';
  function markup(){
    const p=state.profile||{},disabled=state.busy||!state.version;
    const labels={legal_name:'Legal name',llc:'LLC (optional)',email:'Email',phone:'Phone',mailing_address:'Mailing address',typed_signature:'Typed signature (draft only)'};
    return '<section id="operator-profile" class="wos-kit wos-settings-form" aria-label="My profile"><h2>My profile</h2><p role="status" data-profile-status>'+esc(state.message)+'</p>'+
      '<form data-profile-form><div class="wos-form-fields">'+Object.entries(labels).map(([key,label])=>'<label>'+label+(key==='mailing_address'?'<textarea name="'+key+'" maxlength="500">'+esc(p[key])+'</textarea>':'<input name="'+key+'" type="'+(key==='email'?'email':key==='phone'?'tel':'text')+'" maxlength="'+({email:254,phone:40}[key]||160)+'"'+(key==='legal_name'?' required':'')+' value="'+esc(p[key])+'">')+'</label>').join('')+'</div>'+
      '<label>Signature image (optional, PNG or JPEG, up to 64 KB)<input type="file" accept="image/png,image/jpeg" data-profile-image></label>'+
      (p.signature_image?'<figure><img alt="Draft signature preview" src="'+esc(p.signature_image)+'"><figcaption>Draft presentation only. Not a signed agreement.</figcaption></figure><button type="button" data-profile-remove-image>'+icon('x')+'Remove image from draft</button>':'')+
      '<label class="wos-form-review"><input name="reviewed" type="checkbox" title="Review the profile details used in unsigned drafts"> I reviewed these details for my unsigned drafts</label><div class="wos-form-actions"><button type="submit"'+(disabled?' disabled':'')+' title="Save your reviewed profile; no message or agreement is sent">'+icon('check')+'Save profile</button><button type="button" data-profile-reload'+(state.busy?' disabled':'')+'>'+icon('refresh-cw')+'Reload saved profile</button></div></form>'+
      '<p>Unsigned drafts only. No bank or wire details. Legacy contract autofill is unavailable.</p><p>Deposits: buyer-funded at assignment or blank for review. No deposit assigned to the operator.</p></section>';
  }
  function paint(){const el=document.querySelector('#operator-profile');if(el)el.outerHTML=markup();}
  function notice(message){const el=document.querySelector('[data-profile-status]');if(el)el.textContent=message;}
  function clear(){++sequence;state={version:null,profile:null,busy:false,message:'Dashboard login required.'};paint();}
  async function load(){
    const identity=actor();if(!identity){clear();return;}
    const ticket=++sequence;state={version:null,profile:null,busy:true,message:'Loading saved profile...'};paint();
    try{
      const r=await fetch('/api/dashboard/operator-profile',{cache:'no-store'}),data=await r.json();
      if(ticket!==sequence||actor()!==identity)return;
      if(!r.ok||typeof data.version!=='string'||data.profile!==null&&(!data.profile||fields.some(key=>typeof data.profile[key]!=='string')))throw Error();
      state={version:data.version,profile:data.profile,busy:false,message:data.profile?'Saved profile loaded. Review changes before saving.':'No saved profile. Enter and review your details.'};
      root.dispatchEvent(new Event('wos:profile-changed'));
    }catch{if(ticket!==sequence||actor()!==identity)return;state={version:null,profile:null,busy:false,message:'Profile unavailable. Check your admin login, then reload.'};}
    paint();
  }
  function values(form){const p={};for(const key of fields)p[key]=key==='signature_image'?state.profile?.signature_image||'':form.elements[key].value;return p;}
  const settings=root.renderSettings;
  root.renderSettings=function(){
    ++sequence;state={version:null,profile:null,busy:true,message:'Loading saved profile...'};
    // Replace the obsolete, non-persisting Company Info block; keep other Settings integrations.
    const template=document.createElement('template');template.innerHTML=settings.apply(this,arguments);
    const old=template.content.querySelector('#s-company')?.closest('.form-row')?.parentElement;
    if(old)old.outerHTML=markup();
    else{const panel=document.createElement('template');panel.innerHTML=markup();template.content.append(panel.content);}
    setTimeout(load,0);return template.innerHTML;
  };
  const signout=root.signOutDashboard;if(signout)root.signOutDashboard=function(){clear();return signout.apply(this,arguments);};
  const login=root.showDashboardLogin;if(login)root.showDashboardLogin=function(){clear();return login.apply(this,arguments);};
  root.addEventListener('wos:session-ended',clear);
  root.addEventListener('pagehide',clear);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-profile-reload]')&&!state.busy)load();
    if(event.target.closest('[data-profile-remove-image]')&&!state.busy){const form=document.querySelector('[data-profile-form]');if(form){state.profile={...values(form),signature_image:''};paint();}}
  });
  document.addEventListener('change',async event=>{
    if(!event.target.matches('[data-profile-image]')||state.busy)return;
    const file=event.target.files?.[0],form=event.target.closest('form'),identity=actor(),ticket=sequence;
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>64*1024){event.target.value='';notice('Choose a PNG or JPEG up to 64 KB. Nothing saved.');return;}
    const pending=values(form);
    try{
      const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      if(ticket!==sequence||actor()!==identity)return;
      const bytes=atob(value.split(',')[1]||'');
      if(bytes.length<16||!(file.type==='image/png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):bytes.startsWith('\xff\xd8\xff')))throw Error();
      state.profile={...pending,signature_image:value};state.message='Image added to draft. Review and save to keep it.';paint();
    }catch{if(ticket===sequence&&actor()===identity)notice('Image could not be read. Nothing saved.');}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-profile-form]');if(!form)return;event.preventDefault();
    if(state.busy||!state.version||!actor())return;
    if(!form.elements.reviewed.checked){notice('Review your details and tick the checkbox first. Nothing saved.');return;}
    const body={profile:values(form),version:state.version,reviewed:true},identity=actor(),ticket=++sequence;
    state.busy=true;Array.from(form.elements).forEach(el=>el.disabled=true);notice('Saving reviewed profile...');
    try{
      const r=await fetch('/api/dashboard/operator-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await r.json();
      if(ticket!==sequence||actor()!==identity)return;
      if(!r.ok)throw Object.assign(Error(),{conflict:r.status===409,denied:r.status===401||r.status===403});
      if(typeof data.version!=='string'||!data.profile||fields.some(key=>typeof data.profile[key]!=='string'))throw Error();
      state={profile:data.profile,version:data.version,busy:false,message:'Reviewed profile saved. No message sent; no agreement signed.'};root.dispatchEvent(new Event('wos:profile-changed'));paint();
    }catch(error){
      if(ticket!==sequence||actor()!==identity)return;
      if(error.denied){clear();return;}
      state.busy=false;state.version=null;
      Array.from(form.elements).forEach(el=>el.disabled=false);
      form.querySelector('[type=submit]').disabled=true;
      notice(error.conflict?'Profile changed. Reload saved profile before editing again. Nothing saved.':'Save not confirmed. Reload saved profile before trying again.');
    }
  });
})(window);
