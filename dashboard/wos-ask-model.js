'use strict';
(function(root){
  function answer(query,data){
    if(!data||data.source_kind!=='derived_workflow'||data.read_only!==true||data.feed_incomplete!==true||!Array.isArray(data.records)||!Array.isArray(data.people))return {text:'Recorded data is unavailable. Reload the snapshot.',items:[]};
    if(typeof query!=='string'||query.length>300||/[\x00-\x1f<>]/.test(query))return {text:'Use a short question or an exact record reference.',items:[]};
    const q=query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const result=(text,items=[],extra={})=>({text,items,...extra});
    if(/^(what('s| is) waiting( on me)?|waiting|pendientes|que esta pendiente)\??$/.test(q))return result(data.coverage.action_total+' recorded items need review or follow-up. Why: the existing Today queue lists them. Feed incomplete.',data.actions);
    if(/^(new deals( today)?|deals today|nuevos negocios( hoy)?)\??$/.test(q)){
      const items=data.records.filter(row=>row.first_seen_day===data.today);
      return result(items.length+' loaded deals were first recorded today in the dashboard time zone. Why: their recorded first-seen date, not a fresh capture or an estimated date. Feed incomplete.',items);
    }
    if(/^(what did we do yesterday|yesterday|ayer|que hicimos ayer)\??$/.test(q))return result(data.brief.yesterday_done+' recorded activities yesterday. Why: the existing Calendar brief counts them; unreported work is not included.',data.events.filter(e=>e.day===data.yesterday&&e.state==='recorded').slice(-10).reverse().map(e=>({kind:'calendar',name:e.title,ref:e.target?.ref||'',label:e.summary||e.source_kind})),{calendar:true});
    let target=q.replace(/^(where are we (with|on)|show|which buyers match|donde estamos con|mostrar|que compradores coinciden con)\s+/,'').replace(/\?$/,'').trim();
    const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const matches=data.records.concat(data.people).filter(row=>normalized(row.ref)===target||normalized(row.name)===target);
    if(matches.length>1)return result('More than one recorded item matches. Choose the exact record; I will not guess.',matches);
    if(matches.length===1){const record=matches[0];
      if(/^(which buyers match|que compradores coinciden con)\s/.test(q))return record.kind==='deal'?result(record.match_total+' canonical buyer matches; showing '+record.matches.length+'. A posted buy box or operator approval is not proof of funds.',[],{record}):result('Choose a deal reference to see its matching buyers.',[],{record});
      return result(record.kind==='deal'?'Recorded stage: '+record.stage+'. Current status: '+record.status_label+'. Why: the canonical deal workflow, not this demo, determines it.':'Recorded buyer approval: '+(record.approval||'Not recorded')+'. Approval is not proof of funds.',[],{record});
    }
    return result('I cannot resolve that question to one loaded record. Try an exact reference, What is waiting on me, New deals today, or What did we do yesterday. This is a read-only demo, not an AI chat.',[]);
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={answer};return;}
  root.wosAskModel={answer};
})(typeof window==='undefined'?{}:window);
