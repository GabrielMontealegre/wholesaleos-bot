'use strict';
(function(root){
  var data=null,busy=false,error='',status='',chosen='holder_jv_reply';
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function time(value){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-US',{timeZone:'Etc/GMT+7',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'Unknown';}
  function markup(){
    var items=data&&data.items||[];var current=items.find(row=>row.kind===chosen);
    return '<section id="email-template-library"><h3>Message templates</h3><p data-template-status role="status">'+esc(error||status)+'</p>'+
      '<button type="button" data-template-load'+(busy?' disabled':'')+'>Load reviewed templates</button>'+
      (data?'<dl class="et-counts">'+items.map(row=>'<div><dt>'+esc(row.label)+'</dt><dd>'+row.approved_send_count+' approved sends recorded; '+row.approvals_remaining+' until the first 20</dd></div>').join('')+'</dl>':'')+
      (current?'<form data-template-form><label>Message kind<select name="kind" data-template-kind>'+items.map(row=>'<option value="'+esc(row.kind)+'"'+(row.kind===chosen?' selected':'')+'>'+esc(row.label)+'</option>').join('')+'</select></label>'+
        '<p>'+esc(current.invalid_history?'Recorded template needs investigation.':current.full_preview_required?'Full message review required before sending.':'First 20 recorded. Sending still requires your explicit action.')+'</p>'+
        (current.template?'<small>Operator-reviewed text; recorded '+esc(time(current.template.recorded_at))+' by '+esc(current.template.operator_id)+'.</small>':'')+
        '<label>Subject<input name="subject" maxlength="240" required value="'+esc(current.template&&current.template.subject)+'"></label><label>Template text<textarea name="body" maxlength="4000" required>'+esc(current.template&&current.template.body)+'</textarea></label>'+
        '<label><input type="checkbox" name="reviewed"> I reviewed this template text</label><button type="submit" title="Save your reviewed text; no email is sent"'+(busy||current.invalid_history?' disabled':'')+'>Save reviewed template</button><p>Template review is not a sent email.</p></form>':'')+'</section>';
  }
  function paint(){var element=document.querySelector('#email-template-library');if(element)element.outerHTML=markup();}
  async function load(){if(busy)return;busy=true;error='';paint();try{var response=await fetch('/api/dashboard/email-templates');if(!response.ok)throw Error();var value=await response.json();if(!Array.isArray(value.items))throw Error();data=value;}catch(_){data=null;error='Templates unavailable. Check your admin session.';}finally{busy=false;paint();}}
  var gmail=root.renderGmail;root.renderGmail=function(){return gmail()+markup();};
  document.addEventListener('click',event=>{if(event.target.closest('[data-template-load]'))load();});
  document.addEventListener('change',event=>{if(event.target.matches('[data-template-kind]')){chosen=event.target.value;status='';error='';paint();}});
  document.addEventListener('submit',async event=>{
    var form=event.target.closest('[data-template-form]');if(!form)return;event.preventDefault();if(busy)return;
    var current=data.items.find(row=>row.kind===chosen);var f=form.elements;
    if(!f.reviewed.checked){form.querySelector('p').textContent='Review the template and tick the checkbox first. Nothing saved.';return;}
    var body={kind:chosen,subject:f.subject.value,body:f.body.value,version:current.version,reviewed:true};var button=form.querySelector('[type=submit]');Array.from(form.elements).forEach(el=>{el.disabled=true;});busy=true;
    try{var response=await fetch('/api/dashboard/email-templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var result=await response.json();if(!response.ok)throw Error(result.code==='email_template_changed'?'Template changed. Reload it before saving.':'Template not saved. Check your admin session and text.');status=result.status;busy=false;await load();}
    catch(error){form.querySelector('p').textContent=error.message;busy=false;Array.from(form.elements).forEach(el=>{el.disabled=false;});}
  });
  var style=document.createElement('style');style.textContent='#email-template-library{padding-block:20px;border-top:1px solid var(--line,#637891);margin-top:20px;min-width:0}.et-counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.et-counts dd{margin:4px 0}.et-counts dt{font-weight:600}[data-template-form]{max-width:720px;display:grid;gap:12px}[data-template-form] label{display:grid;gap:6px;min-width:0}[data-template-form] input:not([type=checkbox]),[data-template-form] select,[data-template-form] textarea{box-sizing:border-box;max-width:100%;width:100%;min-height:44px}[data-template-form] textarea{min-height:180px}[data-template-form] label:has(input[type=checkbox]){display:flex;align-items:center;min-height:44px;gap:10px}[data-template-form] input[type=checkbox]{width:auto;flex-shrink:0}#email-template-library button{min-height:44px;max-width:100%;white-space:normal}';document.head.appendChild(style);
})(window);
