'use strict';
function dayAt(instant,timeZone) {
  const date=new Date(instant);
  if(!Number.isFinite(date.getTime()))throw Error('brief_timestamp_invalid');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=k=>parts.find(p=>p.type===k).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
module.exports={dayAt};
