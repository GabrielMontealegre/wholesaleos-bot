// modules/sources/socrata-extra.js
// 20 additional cities via Socrata open data — no Playwright needed
'use strict';

const axios = require('axios');
const db    = require('../../db');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

const EXTRA_SOURCES=[
  {name:'miami_fl',market:'Miami, FL',state:'FL',city:'Miami',url:'https://opendata.miamidade.gov/resource/9ubs-ywwe.json',leadType:'Code Violation',fields:{address:'violation_location',status:'case_status',type:'violation_type',date:'date_issue'}},
  {name:'tampa_fl',market:'Tampa, FL',state:'FL',city:'Tampa',url:'https://data.tampagov.net/resource/gcnb-3c5r.json',leadType:'Code Violation',fields:{address:'address',status:'case_status',type:'violation_type',date:'date_entered'}},
  {name:'orlando_fl',market:'Orlando, FL',state:'FL',city:'Orlando',url:'https://data.cityoforlando.net/resource/avkq-4mwj.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'violation_code_description',date:'complaint_date'}},
  {name:'atlanta_ga',market:'Atlanta, GA',state:'GA',city:'Atlanta',url:'https://opendata.atlantaga.gov/resource/xhab-nkg5.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'category',date:'opened_date'}},
  {name:'dallas_tx',market:'Dallas, TX',state:'TX',city:'Dallas',url:'https://www.dallasopendata.com/resource/wx34-mrmb.json',leadType:'Code Violation',fields:{address:'address',status:'service_request_status',type:'type_of_service_request',date:'date_service_request_was_received'}},
  {name:'san_antonio_tx',market:'San Antonio, TX',state:'TX',city:'San Antonio',url:'https://data.sanantonio.gov/resource/arqc-zbpb.json',leadType:'Code Violation',fields:{address:'address',status:'casestatus',type:'casetype',date:'openeddate'}},
  {name:'columbus_oh',market:'Columbus, OH',state:'OH',city:'Columbus',url:'https://opendata.columbus.gov/resource/q9n5-3xi7.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'complaint_type',date:'reported_date'}},
  {name:'cincinnati_oh',market:'Cincinnati, OH',state:'OH',city:'Cincinnati',url:'https://data.cincinnati-oh.gov/resource/6ac7-gdbj.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'case_type',date:'date_entered'}},
  {name:'grand_rapids_mi',market:'Grand Rapids, MI',state:'MI',city:'Grand Rapids',url:'https://data.grandrapidsmi.gov/resource/iy4w-swab.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'type',date:'opened'}},
  {name:'richmond_va',market:'Richmond, VA',state:'VA',city:'Richmond',url:'https://data.richmondgov.com/resource/gb9t-6cxk.json',leadType:'Code Violation',fields:{address:'parcel_address',status:'case_status',type:'case_type',date:'date_opened'}},
  {name:'indianapolis_in',market:'Indianapolis, IN',state:'IN',city:'Indianapolis',url:'https://data.indy.gov/resource/dkfn-ffwx.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'violation_type',date:'date_opened'}},
  {name:'st_louis_mo',market:'St. Louis, MO',state:'MO',city:'St. Louis',url:'https://www.stlouis-mo.gov/data/api/resource/j24x-bh4e.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'violation',date:'dateopen'}},
  {name:'minneapolis_mn',market:'Minneapolis, MN',state:'MN',city:'Minneapolis',url:'https://opendata.minneapolismn.gov/resource/iw6v-7nbr.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'case_type',date:'opened_date'}},
  {name:'denver_co',market:'Denver, CO',state:'CO',city:'Denver',url:'https://data.denvergov.org/resource/5gr5-9nby.json',leadType:'Code Violation',fields:{address:'incident_address',status:'status',type:'case_type',date:'incident_date'}},
  {name:'phoenix_az',market:'Phoenix, AZ',state:'AZ',city:'Phoenix',url:'https://www.phoenixopendata.com/resource/5kvp-48b2.json',leadType:'Code Violation',fields:{address:'address',status:'case_status',type:'case_type',date:'opened_date'}},
  {name:'las_vegas_nv',market:'Las Vegas, NV',state:'NV',city:'Las Vegas',url:'https://opendata.lasvegasnevada.gov/resource/y5ge-79bx.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'type',date:'date_opened'}},
  {name:'charlotte_nc',market:'Charlotte, NC',state:'NC',city:'Charlotte',url:'https://data.charlottenc.gov/resource/5fn9-xkek.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'complaint_type',date:'opendate'}},
  {name:'memphis_tn',market:'Memphis, TN',state:'TN',city:'Memphis',url:'https://data.memphistn.gov/resource/s4ww-2ucm.json',leadType:'Code Violation',fields:{address:'address',status:'status',type:'category',date:'date_entered'}},
  {name:'cook_county_il_tax',market:'Cook County, IL (Tax Liens)',state:'IL',city:'Chicago',url:'https://datacatalog.cookcountyil.gov/resource/5pge-nu6u.json',leadType:'Tax Delinquency',fields:{address:'property_address',status:'status',type:'type',date:'year'}},
  {name:'bexar_county_tx_tax',market:'Bexar County, TX (Tax Liens)',state:'TX',city:'San Antonio',url:'https://data.sanantonio.gov/resource/rqe9-my2d.json',leadType:'Tax Delinquency',fields:{address:'situs_address',status:'status',type:'account_type',date:'delinquency_date'}},
];

async function querySocrata(source,limit){
  try{
    const res=await axios.get(source.url,{params:{'$limit':limit||200,'$order':':created_at DESC'},headers:{'Accept':'application/json'},timeout:20000});
    return (res.data||[]).filter(function(r){const a=r[source.fields.address]||r.address||'';return a&&a.length>5&&/^\d/.test(a.toString().trim());});
  }catch(e){
    try{
      const res=await axios.get(source.url,{params:{'$limit':limit||200},headers:{'Accept':'application/json'},timeout:20000});
      return (res.data||[]).filter(function(r){const a=r[source.fields.address]||r.address||'';return a&&a.length>5&&/^\d/.test(a.toString().trim());});
    }catch(e2){console.error('[socrata-extra] Error '+source.market+':',e2.message);return [];}
  }
}

function recordToLead(record,source){
  const address=(record[source.fields.address]||record.address||'').toString().trim().toUpperCase();
  if(!address||address.length<5)return null;
  const type=(record[source.fields.type]||source.leadType).toString();
  const dateRaw=record[source.fields.date]||new Date().toISOString();
  const dateStr=dateRaw?new Date(dateRaw).toISOString().slice(0,10):new Date().toISOString().slice(0,10);
  return {
    address,city:source.city,state:source.state,
    source:source.market,source_platform:'Socrata',
    lead_type:'raw',violations:[type],
    motivation:source.leadType.toLowerCase().replace(/\s+/g,'_'),
    motivation_score:source.leadType==='Tax Delinquency'?80:65,
    created:dateStr,created_at:new Date().toISOString(),
    createdAt:Date.now(),createdAtReadable:new Date().toISOString(),
    status:'New Lead',arv:null,
    score:source.leadType==='Tax Delinquency'?80:65,
  };
}

async function runExtraSocrataSources(limitPerSource){
  limitPerSource=limitPerSource||200;
  let totalAdded=0; const results=[];
  for(const source of EXTRA_SOURCES){
    console.log('[socrata-extra] Scanning '+source.market+'...');
    try{
      const records=await querySocrata(source,limitPerSource);
      let added=0;
      for(const rec of records){
        const lead=recordToLead(rec,source);
        if(lead&&!db.leadExists(lead.address)){try{db.addLead(lead);added++;}catch(e){}}
      }
      totalAdded+=added;
      results.push({market:source.market,found:records.length,added});
      await sleep(2000);
    }catch(e){console.error('[socrata-extra] Failed '+source.market+':',e.message);results.push({market:source.market,error:e.message});}
  }
  console.log('[socrata-extra] Done. Total added:',totalAdded);
  return {totalAdded,results};
}

module.exports={runExtraSocrataSources,EXTRA_SOURCES};
