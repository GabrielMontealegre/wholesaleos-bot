'use strict';
(function(root){
  if(document.body.dataset.wosDesign!=='marketplace')return;
  const legacy=['in-system-email-modal','in-system-sms-modal','buyer-detail-modal','search-results-modal','buyer-gen-modal','addr-val-modal','wg-modal','plModal'];
  const focusBefore=new WeakMap();
  function visible(el){return !!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';}
  function dismiss(panel){
    if(panel.id==='modal-overlay')root.closeModal();
    else if(panel.id==='notif-panel')panel.querySelector('[data-bell-close]')?.click();
    else if(panel.tagName==='DIALOG')panel.close();
    else if(panel.id==='plModal')panel.style.display='none';
    else panel.remove();
    const prior=focusBefore.get(panel);if(prior?.isConnected)prior.focus();
  }
  function enhance(){
    for(const panel of document.querySelectorAll('#modal-overlay,dialog,'+legacy.map(id=>'#'+id).join(','))){
      const content=panel.id==='modal-overlay'?document.getElementById('modal-content'):panel.tagName==='DIALOG'?panel:panel.firstElementChild;
      if(!content)continue;
      let close=content.querySelector('[data-panel-dismiss],[aria-label="Close lead"],[data-today-close],[data-search-close],.modal-close,button[title="Close"]');
      if(!close){close=Array.from(content.querySelectorAll('button')).find(b=>/^[x\u00d7\u2715]$/i.test(b.textContent.trim()));}
      if(!close){close=document.createElement('button');content.prepend(close);}
      if(close.dataset.panelDismiss)continue;
      close.type='button';close.dataset.panelDismiss='true';close.textContent='\u00d7';
      if(!close.getAttribute('aria-label'))close.setAttribute('aria-label','Close dialog');
      close.title=close.getAttribute('aria-label');close.classList.add('panel-dismiss');
      const ownedClose=close.getAttribute('onclick')==='closeModal()'||close.matches('[data-today-close],[data-search-close]');
      // Preserve existing shared/delegated close hooks; repair only legacy shell controls.
      if(!ownedClose){close.removeAttribute('onclick');close.onclick=null;
        close.addEventListener('click',event=>{event.stopPropagation();dismiss(panel);});}
      panel.classList.add('panel-hygiene-overlay');
    }
  }
  document.addEventListener('click',()=>{
    for(const panel of document.querySelectorAll('.panel-hygiene-overlay'))if(visible(panel)&&!focusBefore.has(panel))focusBefore.set(panel,document.activeElement);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    const panels=Array.from(document.querySelectorAll('.panel-hygiene-overlay,#notif-panel.open')).filter(visible);
    const panel=panels.sort((a,b)=>(a.tagName==='DIALOG'?100000:Number(getComputedStyle(a).zIndex)||0)-(b.tagName==='DIALOG'?100000:Number(getComputedStyle(b).zIndex)||0)).pop();
    if(panel){event.preventDefault();event.stopImmediatePropagation();dismiss(panel);}
  },true);
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance();
})(window);
