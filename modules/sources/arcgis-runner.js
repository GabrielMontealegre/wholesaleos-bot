// modules/sources/arcgis-runner.js
// 7 ArcGIS cities — pure REST API, no Playwright needed
'use strict';

const axios = require('axios');
const db    = require('../../db');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function featureToLead(feature, source) {
  const p = feature.attributes || feature.properties || {};
  const address = (p[source.fields.address]||p.ADDRESS||p.SITE_ADDRESS||p.PROPERTY_ADDRESS||'').toString().trim().toUpperCase();
  if (!address||address.length<5||!/^\d/.test(address)) return null;
  const status  = (p[source.fields.status]||p.STATUS||'').toString();
  const type    = (p[source.fields.type]||source.leadType).toString();
  const dateRaw = p[source.fields.date]||p.DATE_OPEN||p.DATE_OPENED||p.OPEN_DATE||p.COMPLAINT_DATE;
  const dateStr = dateRaw ? new Date(typeof dateRaw==='number'?dateRaw:dateRaw).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
  if (/closed|resolved|completed|inactive/i.test(status)) return null;
  return {
    address, city:source.city, state:source.state,
    source:'ArcGIS - '+source.market, source_platform:'ArcGIS',
    lead_type:'raw', violations:[type||source.leadType],
    motivation:'code_violation', motivation_score:65,
    created:dateStr, created_at:new Date().toISOString(),
    createdAt:Date.now(), createdAtReadable:new Date().toISOString(),
    status:'New Lead', arv:null, score:65,
  };
}

async function queryArcGIS(source, maxRecords) {
  const leads=[]; let offset=0; const pageSize=100;
  while(leads.length<maxRecords){
    try{
      const res=await axios.get(source.url+'/query',{
        params:{where:'1=1',outFields:'*',f:'json',resultRecordCount:pageSize,resultOffset:offset,orderByFields:(source.fields.date||'OBJECTID')+' DESC'},
        timeout:20000
      });
      const features=res.data.features||[];
      if(!features.length)break;
      for(const feat of features){
        const lead=featureToLead(feat,source);
        if(lead&&!db.leadExists(lead.address))leads.push(lead);
      }
      if(features.length<pageSize)break;
      offset+=pageSize;
      await sleep(2000);
    }catch(e){console.error('[arcgis] Error '+source.market+':',e.message);break;}
  }
  return leads;
}

async function runArcGISSources(maxPerSource) {
  maxPerSource=maxPerSource||200;
  const SOURCES=[
    {name:'glendale_az',market:'Glendale, AZ',state:'AZ',city:'Glendale',url:'https://services1.arcgis.com/pP43XCoyMVPQFsHi/arcgis/rest/services/Code_Violations/FeatureServer/0',leadType:'Code Violation',fields:{address:'ADDRESS',status:'STATUS',type:'VIOLATION_TYPE',date:'DATE_OPEN'}},
    {name:'placer_county_ca',market:'Placer County, CA',state:'CA',city:'Auburn',url:'https://services1.arcgis.com/A8VbfWMVJE8WVNRB/arcgis/rest/services/Code_Enforcement/FeatureServer/0',leadType:'Code Violation',fields:{address:'SITE_ADDRESS',status:'STATUS',type:'CASE_TYPE',date:'DATE_OPENED'}},
    {name:'south_bend_in',market:'South Bend, IN',state:'IN',city:'South Bend',url:'https://services.arcgis.com/S10VBNIzVqFPaKXi/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0',leadType:'Code Violation',fields:{address:'ADDRESS',status:'STATUS',type:'CASE_TYPE',date:'OPEN_DATE'}},
    {name:'greensboro_nc',market:'Greensboro, NC',state:'NC',city:'Greensboro',url:'https://services1.arcgis.com/wdGEbPrxrSkSqxhx/arcgis/rest/services/Code_Enforcement/FeatureServer/0',leadType:'Code Violation',fields:{address:'PROPERTY_ADDRESS',status:'STATUS',type:'VIOLATION_DESCRIPTION',date:'COMPLAINT_DATE'}},
    {name:'wake_county_nc',market:'Wake County, NC',state:'NC',city:'Raleigh',url:'https://services.arcgis.com/v400IkDOw1ad7Yad/arcgis/rest/services/Wake_County_Code_Enforcement/FeatureServer/0',leadType:'Code Violation',fields:{address:'SITE_ADDRESS',status:'CASE_STATUS',type:'CASE_TYPE',date:'DATE_OPENED'}},
    {name:'syracuse_ny',market:'Syracuse, NY',state:'NY',city:'Syracuse',url:'https://services6.arcgis.com/bdPqSfflsdgFRs6Q/arcgis/rest/services/Code_Enforcement_Cases/FeatureServer/0',leadType:'Code Violation',fields:{address:'ADDRESS',status:'CASE_STATUS',type:'CASE_TYPE',date:'DATE_FILED'}},
    {name:'nashville_tn',market:'Nashville, TN',state:'TN',city:'Nashville',url:'https://services2.arcgis.com/7AKsRMsWpbkPM0dh/arcgis/rest/services/Metro_Code/FeatureServer/0',leadType:'Code Violation',fields:{address:'ADDRESS',status:'STATUS',type:'VIOLATION_TYPE',date:'COMPLAINT_DATE'}},
  ];
  let totalAdded=0; const results=[];
  for(const source of SOURCES){
    console.log('[arcgis] Scanning '+source.market+'...');
    try{
      const leads=await queryArcGIS(source,maxPerSource);
      let added=0;
      for(const lead of leads){try{db.addLead(lead);added++;}catch(e){}}
      totalAdded+=added;
      results.push({market:source.market,found:leads.length,added});
      await sleep(3000);
    }catch(e){console.error('[arcgis] Failed '+source.market+':',e.message);results.push({market:source.market,error:e.message});}
  }
  console.log('[arcgis] Total added:',totalAdded);
  return {totalAdded,results};
}

module.exports = {runArcGISSources,queryArcGIS};
