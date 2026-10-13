'use strict';
function grade(deal,evaluation){
  if(deal.approval==='rejected'||['STALE','NO'].includes(evaluation.verdict)||['expired','closed','dead'].includes(evaluation.status))return {label:'Archive',missing:[],source_kind:'derived_interim_grade'};
  const room=evaluation.matches[0]?.estimated_spread?.low;
  const criteria={reviewed:deal.approval==='approved'&&!!deal.evidence_reviewed_at&&!!deal.evidence_reviewed_by,value:!!evaluation.value.range&&['Verified','Preliminary'].includes(evaluation.value.tier),buyer:evaluation.matches.length>0,room:typeof room==='number'&&Number.isFinite(room)&&room>=10000,deadline:Number.isFinite(evaluation.days_to_deadline)&&evaluation.days_to_deadline>=3};
  const missing=Object.keys(criteria).filter(key=>!criteria[key]);
  const label=!missing.length?'Black Diamond':missing.length===1?'Gold':deal.address&&deal.source_url?'Silver':'Unrated';
  return {label,missing,source_kind:'derived_interim_grade'};
}
module.exports={grade};
