'use strict';
function matches(row,{stage='',search=''}={}){
  if(stage&&row.jv_workflow?.stage!==stage)return false;
  const q=String(search).trim().slice(0,160).toLowerCase();if(!q)return true;
  const fields=[row.city,row.county,row.state,row.zip,row.record_ref];
  if(row.deal_kind!=='jv'||row.jv_workflow?.full_package_evidence_ready===true)fields.push(row.address);
  return fields.some(v=>typeof v==='string'&&v.toLowerCase().includes(q));
}
module.exports={matches};
