'use strict';
const triage=require('./triage');const {dayAt}=require('../records/calendar-day');
function registerLeadTriageRoutes(app,{db,requireAdmin,now=()=>new Date().toISOString()}){
  const report=()=>{const at=now();return triage.plan(db.readDBStrict(),{today:dayAt(at,'America/Mazatlan'),now:at});};
  app.get('/api/dashboard/lead-triage',requireAdmin,(req,res)=>{try{res.set('Cache-Control','no-store').json(report());}catch(_){res.status(503).json({code:'lead_triage_unavailable'});}});
  app.get('/api/leads/needs-comps',requireAdmin,(req,res)=>{const value=String(req.query.limit??'10');if(!/^[1-9]\d?$/.test(value)||Number(value)>20)return res.status(400).json({code:'lead_triage_limit_invalid'});
    try{const result=report();res.set('Cache-Control','no-store').json({read_only:true,source_kind:'derived_workflow',total:result.counts.keep,items:result.top_keep_ids.slice(0,Number(value)),ids_only:true});}catch(_){res.status(503).json({code:'lead_triage_unavailable'});}
  });
}
module.exports={registerLeadTriageRoutes};
