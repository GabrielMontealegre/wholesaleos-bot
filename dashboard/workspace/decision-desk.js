'use strict';
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.WOSDecisionDesk=api;})(typeof window!=='undefined'?window:null,function(){
  function invalid(){throw Error('decision_answer_invalid');}
  function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(function(key){var d=Object.getOwnPropertyDescriptor(value,key);return !d||!Object.hasOwn(d,'value');}))invalid();}
  function time(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))invalid();return Date.parse(value);}
  function answer(row,view,clock){
    var keys=['id','snapshot_id','item_id','choice','note','answered_at'];
    if(!row||typeof row!=='object'||Array.isArray(row)||Reflect.ownKeys(row).length!==keys.length||keys.some(function(key){var d=Object.getOwnPropertyDescriptor(row,key);return !d||!Object.hasOwn(d,'value');}))invalid();
    if(typeof row.id!=='string'||!/^[a-f0-9]{64}$/.test(row.id)||row.snapshot_id!==view.receipt_id||!view.decision_desk.item_ids.includes(row.item_id)||!['A','B','C'].includes(row.choice)||typeof row.note!=='string'||row.note.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(row.note)||time(row.answered_at)>clock||time(row.answered_at)<time(view.imported_at))invalid();
    return {id:row.id,snapshot_id:row.snapshot_id,item_id:row.item_id,choice:row.choice,note:row.note,answered_at:row.answered_at};
  }
  function read(data,view){
    exact(data,['ok','now','items','next_after']);
    if(data.ok!==true||!Array.isArray(data.items)||data.items.length>1000||Reflect.ownKeys(data.items).length!==data.items.length+1||data.next_after!==null)invalid();
    for(var i=0;i<data.items.length;i++){var d=Object.getOwnPropertyDescriptor(data.items,String(i));if(!d||!Object.hasOwn(d,'value'))invalid();}
    var clock=time(data.now),seen=new Set();
    return data.items.map(function(row,index){if(!Object.hasOwn(data.items,index))invalid();var value=answer(row,view,clock);if(seen.has(value.item_id))invalid();seen.add(value.item_id);return value;});
  }
  function saved(data,view,input){
    exact(data,['ok','now','answer']);if(data.ok!==true)invalid();var value=answer(data.answer,view,time(data.now));
    if(value.item_id!==input.item_id||value.choice!==input.choice||value.note!==input.note)invalid();return value;
  }
  function items(view){return view.decision_desk.tiers.flatMap(function(tier){return tier.items;});}
  function markup(view,state,helpers){
    var c=helpers.c,esc=c.escape,stamp=helpers.stamp,dollars=helpers.dollars,all=items(view);
    function source(){return '<small class="ws-assistant-source">From the assistant · '+esc(stamp(view.generated_at))+'</small>';}
    function flag(value){return value===true?'Yes':value===false?'No':'Not reported';}
    function values(rows){return esc(rows.length?rows.join(', '):'Not reported');}
    function walkLine(item){
      var walk=item.walk_plan;if(!walk)return '';
      if(walk.rung==='signed_partner_buyer'&&item.walk_buyer_agreement_reported_signed!==true)return '<p data-decision-walk>Walk: buyer agreement confirmation needed.</p>';
      var labels={agent_video:'agent video call',contractor_bid:'contractor bid',signed_partner_buyer:'partner buyer (agreement reported signed)',paid_walker:'paid walker'};
      return '<p data-decision-walk>Walk: '+esc(labels[walk.rung])+', '+esc(walk.status===null?'status not reported':walk.status)+(walk.scheduled_at===null?'':' · '+esc(stamp(walk.scheduled_at,true)))+'</p>';
    }
    var tabs='<div class="ws-tabs" role="tablist" aria-label="Assistant views">'+[['desk','Decision Desk'],['agents','Agents'],['outreach','Outreach']].map(function(pair){return '<button type="button" class="ws-tab" role="tab" id="decision-tab-'+pair[0]+'" aria-controls="decision-panel-'+pair[0]+'" aria-selected="'+String(state.tab===pair[0])+'" tabindex="'+(state.tab===pair[0]?'0':'-1')+'" data-decision-tab="'+pair[0]+'">'+pair[1]+'</button>';}).join('')+'</div>';
    var titles=['Money decisions','Next decisions','Other decisions'];
    var desk=view.decision_desk.tiers.map(function(tier){return '<section class="ws-assistant-group"><h3>'+titles[tier.tier-1]+'</h3>'+(tier.items.length?tier.items.map(function(item){
      var index=all.indexOf(item),last=state.answers.get(item.id),disabled=!state.ready||state.busy||state.uncertain;
      var labels={ask:'Asking price',value_fixed:'Value after repairs',repairs:'Repairs',buyer_number:'Buyer number',our_offer:'Our offer',fee_estimate_low:'Fee estimate low (estimate)',fee_estimate_high:'Fee estimate high (estimate)'};
      var recorded=walkLine(item)+'<p data-decision-recorded>'+(last?'Your answer: '+esc(item.options[last.choice].label)+' · Recorded in the app '+esc(stamp(last.answered_at)):'No answer recorded in the app.')+'</p>'+(last&&last.note?'<p class="ws-decision-draft" data-decision-recorded-note>Your note: '+esc(last.note)+'</p>':'');
      return '<article class="ws-decision-card" data-decision-card><h4>'+esc(item.title)+'</h4>'+source()+'<p>'+esc(item.status.replace(/_/g,' '))+' · Due '+esc(stamp(item.due))+'</p><ul class="ws-list">'+item.who.map(function(person){return '<li><strong>'+esc(person.name)+'</strong> · '+esc(person.role)+' · '+esc(person.channel||'Channel not reported')+'</li>';}).join('')+'</ul><ul class="ws-list ws-decision-history">'+item.happened.map(function(event){return '<li><small>'+esc(stamp(event.at))+'</small><p>'+esc(event.text)+'</p></li>';}).join('')+'</ul><dl class="ws-detail ws-decision-numbers">'+Object.keys(labels).map(function(key){return '<div><dt>'+labels[key]+'</dt><dd>'+esc(dollars(item.numbers[key]))+'</dd></div>';}).join('')+'</dl><h5>Suggested draft</h5><p class="ws-decision-draft">'+esc(item.suggestion===null?'No draft reported.':item.suggestion)+'</p><label for="decision-note-'+index+'">Note (optional)</label><textarea id="decision-note-'+index+'" data-decision-note="'+index+'" rows="2" maxlength="2000"'+(state.busy?' readonly':'')+'>'+esc(state.notes.get(item.id)||'')+'</textarea><ul class="ws-list ws-decision-options">'+['A','B','C'].map(function(choice){return '<li><button type="button" class="ws-button" data-decision-choice="'+index+':'+choice+'"'+(disabled?' disabled':'')+'>'+choice+': '+esc(item.options[choice].label)+'</button><p>'+esc(item.options[choice].consequence)+'</p></li>';}).join('')+'</ul>'+recorded+'</article>';
    }).join(''):'<p class="ws-muted">No decisions in this tier.</p>')+'</section>';}).join('')+'<p data-decision-lower-count>Lower-priority decisions: '+view.decision_desk.lower_tier_count+'</p>';
    var agents=view.agents.length?'<ul class="ws-list ws-assistant-rows">'+view.agents.map(function(agent){return '<li><h3>'+esc(agent.name)+'</h3><p>Listing agent · '+esc(agent.brokerage||'Brokerage not reported')+'</p>'+source()+'<p>Markets: '+values(agent.markets)+'</p><p>Properties: '+values(agent.properties)+'</p><p>Email: '+values(agent.emails)+'</p><p>Phone: '+values(agent.phones)+'</p><p>Contacted: '+flag(agent.contacted)+' · Answered: '+flag(agent.answered)+'</p><p>Response time: '+(agent.response_hours===null?'Not reported':esc(String(agent.response_hours))+' hours (reported)')+'</p><p>Last touch: '+esc(stamp(agent.last_touch))+'</p></li>';}).join('')+'</ul>':'<p>No agents reported.</p>';
    var outreach=view.outreach.length?'<ul class="ws-list ws-assistant-rows">'+view.outreach.map(function(row){var agent=view.agents.find(function(value){return value.id===row.agent_id;});return '<li><h3>'+esc(row.address||'Property not reported')+'</h3>'+source()+'<p>'+esc(row.market||'Market not reported')+' · '+esc(agent?agent.name:'Agent not reported')+'</p><p>'+esc(row.next_step||'Next step not reported')+'</p><p>Follow-up: '+esc(stamp(row.follow_up_on))+'</p><p>Contacted: '+flag(row.contacted)+' · Answered: '+flag(row.answered)+'</p><p>'+esc(row.last_answer_summary||'No answer summary reported.')+'</p></li>';}).join('')+'</ul>':'<p>No outreach reported.</p>';
    var counts=view.outreach_counts,summary='<p>Outreach: '+counts.contacted+' contacted, '+counts.answered+' answered, '+(counts.follow_ups_due===null?'follow-up date not available':counts.follow_ups_due+' follow-ups due today')+'</p>'+source();
    return '<div data-decision-desk>'+tabs+'<p role="status" data-decision-status>'+esc(state.message||(!state.ready?'Loading recorded answers...':''))+'</p>'+summary+[['desk',desk],['agents',agents],['outreach',outreach]].map(function(pair){return '<div role="tabpanel" id="decision-panel-'+pair[0]+'" aria-labelledby="decision-tab-'+pair[0]+'"'+(state.tab===pair[0]?'':' hidden')+'>'+pair[1]+'</div>';}).join('')+c.button({label:'All reported buyers',icon:'users',id:'assistant-buyers-open'})+'</div>';
  }
  return {read:read,saved:saved,items:items,markup:markup};
});
