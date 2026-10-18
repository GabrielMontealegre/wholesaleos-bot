'use strict';
(function(root){
  var glossary=Object.create(null),serial=0,bubble=null,active=null,focusOwner=null,lastX=null,lastY=null,timer=null,gesture=null,blockClick=false,suppressed=new WeakSet();
  function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function sentence(value){var text=String(value||'').trim().replace(/\s+/g,' '),match=text.match(/^.*?(?:[.!?](?=\s|$)|$)/);return (match?match[0]:text).slice(0,320);}
  function help(term){if(!glossary[term])return '';var id='wos-tip-'+(++serial);return '<span class="wos-help-anchor" data-help-anchor="'+esc(term)+'" aria-describedby="'+id+'" hidden><span role="tooltip" id="'+id+'">'+esc(sentence(glossary[term]))+'</span></span>';}
  root.wosHelp=help;
  root.renderGlossary=function(){return '<section class="wos-glossary"><h2>Glossary</h2>'+Object.keys(glossary).sort().map(key=>'<div><h3>'+esc(key)+'</h3><p>'+esc(glossary[key])+'</p></div>').join('')+'</section>';};
  var aliases={'our arv':'ARV','our comps':'Comps','buyer max':'Buyer max','estimated spread':'Spread','today\'s deals':'Today’s Deals','source':'Open source','approve':'Approval','approval':'Approval','reject':'Approval','pending':'Approval','approved':'Approval','sold':'Comps','price / basis':'Comps','state':'Filters','county':'Filters','city':'Filters','save':'Approval','review':'Approval','total':'Leads','new today':'Daily target'};
  function termFor(text){var value=String(text||'').trim().toLowerCase();return Object.keys(glossary).find(key=>value===key.toLowerCase())||Object.keys(aliases).filter(key=>value===key||value.startsWith(key+':')||value.startsWith(key+' ')).sort((a,b)=>b.length-a.length).map(key=>aliases[key])[0]||'';}
  var pageHelp={dashboard:'Your day: replies, reviews, deadlines and recent work.',todays_deals:'Deals checked today and their next steps.',jv:'Joint-venture deals and their recorded agreement stages.',leads:'Properties from recorded sources, with their evidence and status.',buyers_found:'People who buy properties, their criteria and matching deals.',gmail:'Your email messages and unsent drafts.',followups:'People and deals waiting for a follow-up.',pipeline:'Deals grouped by their recorded stage.',contracts_lib:'Saved contract documents and their review status.',calendar:'Recorded work, follow-ups and upcoming dates.',drive:'Google Drive authorization status and connection steps.',settings:'Account, connection and workspace settings.'};
  function pageDescription(el){var item=el.closest('.sidebar .nav-item');if(!item)return null;var match=(item.getAttribute('onclick')||'').match(/\bnavigate\(\s*['"]([a-z_]+)['"]/);return match&&Object.hasOwn(pageHelp,match[1])?pageHelp[match[1]]:'';}
  function bind(el,term){
    if(!el||el.closest('.wos-help-anchor,.wos-glossary,.wos-live-tooltip')||el.dataset.helpTarget||el.matches('input[type="hidden"]'))return;
    if(el.matches('.sidebar .nav-section'))return;
    var description=pageDescription(el);if(description==='')return;if(description)el.dataset.helpCopy=description;
    el.dataset.helpTarget='true';if(term&&glossary[term])el.dataset.helpTerm=term;
    el.setAttribute('aria-describedby',((el.getAttribute('aria-describedby')||'')+' wos-live-tooltip').trim());
    if(!el.matches('button,input,select,textarea,a,summary,[role="button"]')&&!el.hasAttribute('tabindex'))el.tabIndex=0;
  }
  function decorate(){
    if(!Object.keys(glossary).length)return;var content=document.getElementById('app')||document.getElementById('content');if(!content)return;
    content.querySelectorAll('[data-help-anchor]').forEach(anchor=>bind(anchor.parentElement,anchor.dataset.helpAnchor));
    content.querySelectorAll('h1,h2,h3,h4,th,dt,label,button,summary,input,select,textarea,[role="button"],.badge,.pill,.nav-badge,.nav-section,.stat-label,.bf-stats span,.td-counts span').forEach(el=>{
      if(el.matches('.cv-row h3,.bf-card h3,.td-card h3'))return;
      var term=termFor(el.getAttribute('aria-label')||el.textContent);if(term||el.matches('label,button,summary,input,select,textarea,[role="button"],th,dt,.badge,.pill,.nav-badge,.nav-section,.stat-label,.bf-stats span,.td-counts span'))bind(el,term);
    });if(active&&!active.isConnected)hide();
  }
  function target(event){return event.target.closest&&event.target.closest('[data-help-target]');}
  function explain(el){return sentence(el.dataset.helpCopy||el.getAttribute('title')||glossary[el.dataset.helpTerm]||(el.matches('input,select,textarea')?'Record only information supported by its source.':el.matches('th,dt,.badge,.pill,.nav-badge,.nav-section,.stat-label,.bf-stats span,.td-counts span')?'Recorded workflow information is separate from verified deal evidence.':'Review the recorded evidence before acting.'));}
  function show(el){
    if(!el||!el.isConnected)return;if(!bubble){bubble=document.createElement('div');bubble.id='wos-live-tooltip';bubble.className='wos-live-tooltip';bubble.setAttribute('role','tooltip');document.body.appendChild(bubble);}
    active=el;bubble.textContent=explain(el);bubble.hidden=false;bubble.style.left='8px';bubble.style.top='8px';
    var r=el.getBoundingClientRect(),b=bubble.getBoundingClientRect();bubble.style.left=Math.max(8,Math.min(r.left,root.innerWidth-b.width-8))+'px';var top=r.top-b.height-8;if(top<8)top=r.bottom+8;bubble.style.top=Math.max(8,Math.min(top,root.innerHeight-b.height-8))+'px';
  }
  function hide(){active=null;if(bubble)bubble.hidden=true;}
  function cancel(){if(timer!=null){root.clearTimeout(timer);timer=null;}}
  document.addEventListener('mouseover',event=>{var el=target(event);if(!focusOwner&&el&&(!event.relatedTarget||!el.contains(event.relatedTarget)))show(el);});
  document.addEventListener('mouseout',event=>{if(!focusOwner&&active&&(!event.relatedTarget||!active.contains(event.relatedTarget)))hide();});
  document.addEventListener('mousemove',event=>{if(event.clientX!==lastX||event.clientY!==lastY){lastX=event.clientX;lastY=event.clientY;focusOwner=null;var el=target(event);if(el)show(el);else hide();}});
  document.addEventListener('focusin',event=>{var el=target(event);focusOwner=el||null;if(el)show(el);});
  document.addEventListener('focusout',()=>{focusOwner=null;hide();});
  document.addEventListener('pointerdown',event=>{cancel();focusOwner=null;lastX=event.clientX;lastY=event.clientY;if(active&&!active.contains(event.target))hide();var el=target(event);if(!el||!['touch','pen'].includes(event.pointerType))return;gesture={el,id:event.pointerId,x:event.clientX,y:event.clientY};timer=root.setTimeout(()=>{timer=null;if(gesture){blockClick=true;suppressed.add(gesture.el);show(gesture.el);}},550);});
  document.addEventListener('pointermove',event=>{if(gesture&&gesture.id===event.pointerId&&(Math.abs(event.clientX-gesture.x)>10||Math.abs(event.clientY-gesture.y)>10)){cancel();gesture=null;}});
  document.addEventListener('pointerup',event=>{if(gesture&&gesture.id===event.pointerId){cancel();gesture=null;}});
  document.addEventListener('pointercancel',()=>{cancel();gesture=null;hide();});
  // Long-press help consumes the following action click, even after cancellation.
  document.addEventListener('click',event=>{var el=target(event);if(blockClick||el&&suppressed.has(el)){blockClick=false;event.preventDefault();event.stopImmediatePropagation();if(el)suppressed.delete(el);}},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){cancel();gesture=null;hide();}});
  document.addEventListener('scroll',()=>{if(focusOwner&&focusOwner.isConnected&&focusOwner===document.activeElement){var r=focusOwner.getBoundingClientRect();if(r.bottom>0&&r.top<root.innerHeight)return show(focusOwner);}hide();},true);
  fetch('/dashboard/glossary.json').then(r=>{if(!r.ok)throw Error('unavailable');return r.json();}).then(value=>{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>256||Object.entries(value).some(([key,text])=>['__proto__','constructor','prototype'].includes(key)||typeof text!=='string'||text.length>1000))throw Error('invalid');glossary=Object.assign(Object.create(null),value);decorate();}).catch(()=>{});
  new MutationObserver(decorate).observe(document.getElementById('app')||document.getElementById('content')||document.body,{childList:true,subtree:true});
  var style=document.createElement('style');style.textContent='.wos-live-tooltip{position:fixed;max-width:min(320px,calc(100vw - 16px));box-sizing:border-box;background:#0b0d12;color:#f1f4f8;border:1px solid #657487;border-radius:6px;padding:10px 12px;font:14px/1.5 Arial;letter-spacing:0;z-index:10010;pointer-events:none;overflow-wrap:anywhere}.wos-live-tooltip[hidden],.wos-help-anchor{display:none!important}[data-help-target]:focus-visible{outline:2px solid var(--link,#7eb8ff);outline-offset:3px}.wos-glossary{max-width:900px;color:var(--ink,#e2e8f0)}.wos-glossary div{border-bottom:1px solid var(--line,#42516a);padding:12px 0}.wos-glossary h3{font-size:16px}.wos-glossary p{font-size:14px;line-height:1.5}';document.head.appendChild(style);
})(window);
