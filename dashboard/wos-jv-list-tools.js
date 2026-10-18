'use strict';
(function(root){
  let stage='',search='',moreOpen=false,timer=null,searchFocus=false;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function activeCount(el){return [...el.querySelectorAll('[data-deal-filter]')].filter(x=>x.type==='checkbox'?x.checked:!!x.value).length;}
  function enhance(data){
    const page=document.querySelector('#wos-todays-deals'),bar=page?.querySelector('.td-filter-bar');if(!bar||bar.querySelector('.td-jv-primary'))return;
    const advanced=bar.querySelector('.td-filters'),location=bar.querySelector('.wos-location-filters');if(!advanced||!location)return;
    const labels=data?.jv_stage_labels||{},primary=document.createElement('div');primary.className='td-jv-primary';
    primary.appendChild(location);location.querySelector(':scope>small')?.remove();
    const controls=document.createElement('div');controls.className='td-jv-stage-search';controls.innerHTML='<label>Stage<select data-jv-list-stage'+(!Object.keys(labels).length?' disabled':'')+'><option value="">All stages</option>'+Object.entries(labels).map(([key,label])=>'<option value="'+esc(key)+'"'+(stage===key?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label><label>Search<input type="search" data-jv-list-search maxlength="160" value="'+esc(search)+'" placeholder="City, ZIP or reference" title="Search permitted card fields; unsigned property addresses are withheld"></label>';
    primary.appendChild(controls);const more=document.createElement('details');more.className='td-jv-more';more.open=moreOpen;more.innerHTML='<summary>More filters'+(activeCount(advanced)?' ('+activeCount(advanced)+' active)':'')+'</summary>';more.appendChild(advanced);bar.appendChild(primary);bar.appendChild(more);
    if(searchFocus){const input=bar.querySelector('[data-jv-list-search]');input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}
  }
  function reload(){clearTimeout(timer);root.wosReloadJVList?.();}
  root.wosJVListTools={enhance,params:()=>({stage,search})};
  document.addEventListener('change',e=>{if(e.target.matches('[data-jv-list-stage]')){stage=e.target.value;reload();}const more=e.target.closest('.td-jv-more');if(more){const count=activeCount(more);more.querySelector('summary').textContent='More filters'+(count?' ('+count+' active)':'');}});
  document.addEventListener('input',e=>{if(e.target.matches('[data-jv-list-search]')){search=e.target.value.slice(0,160);clearTimeout(timer);timer=setTimeout(reload,350);}});
  document.addEventListener('keydown',e=>{if(e.target.matches('[data-jv-list-search]')&&e.key==='Enter'){e.preventDefault();reload();}});
  document.addEventListener('focusin',e=>{searchFocus=e.target.matches('[data-jv-list-search]');});
  document.addEventListener('pointerdown',e=>{if(!e.target.matches('[data-jv-list-search]'))searchFocus=false;});
  document.addEventListener('toggle',e=>{if(e.target.matches('.td-jv-more'))moreOpen=e.target.open;},true);
  const prior=root.signOutDashboard;if(prior)root.signOutDashboard=function(){clearTimeout(timer);stage='';search='';moreOpen=false;searchFocus=false;return prior.apply(this,arguments);};
})(window);
