// WholesaleOS Patch v4 CLEAN — loaded as external script
// 1. STRICT BUYER MATCHING
function matchBuyersToLead(lead,buyers){
  buyers=buyers||APP.buyers||[];if(!lead||!buyers.length)return[];
  return buyers.map(function(b){
    var score=0,reasons=[];
    var bs=(b.states&&b.states.length)?b.states:(b.state?[b.state]:[]);
    if(bs.length&&bs.indexOf(lead.state)===-1)return{buyer:b,score:0,reasons:[]};
    score+=30;reasons.push("state");
    if(!(b.buyTypes||[]).length||(b.buyTypes||[]).indexOf(lead.type)>-1){score+=25;reasons.push("type");}
    var op=lead.offer||(lead.arv?Math.round(lead.arv*0.7):0);
    if(op>=(b.minPrice||0)&&op<=(b.maxPrice||999999999)){score+=25;reasons.push("price");}
    return{buyer:b,score:score,reasons:reasons};
  }).filter(function(m){return m.score>=30;}).sort(function(a,b){return b.score-a.score;});
}
// 2. HELPERS
function closeSearchModal(){var m=document.getElementById("search-results-modal");if(m)m.remove();}
function closeBulkModal(){var m=document.getElementById("bulk-send-modal");if(m)m.remove();}
function setLeadsFilter(s){APP._leadsStatusFilter=s;_leadsPage=0;APP.filtered=s==="All"?APP.leads:(APP.leads||[]).filter(function(l){return(l.status||"New Lead")===s;});render();}
function leadsNextPage(){var t=(APP.filtered||APP.leads||[]).length;if(_leadsPage<Math.ceil(t/_leadsPerPage)-1){_leadsPage++;render();}}
function leadsPrevPage(){if(_leadsPage>0){_leadsPage--;render();}}
function leadsSetPerPage(n){_leadsPage=0;_leadsPerPage=parseInt(n);render();}
var _leadsPage=0,_leadsPerPage=200;
function getDealRefId(l){if(l.ref_id)return l.ref_id;var st=(l.state||"XX").toUpperCase().slice(0,2);var h=0,id=l.id||"";for(var i=0;i<id.length;i++)h=((h<<5)-h)+id.charCodeAt(i);return st+"-"+(Math.abs(h)%9000+1000);}
function assignRefIds(ls){return ls.map(function(l){if(!l.ref_id)l.ref_id=getDealRefId(l);return l;});}
function updateLeadsBadge(){var b=document.getElementById("nav-lead-count");if(!b)return;var n=(APP.leads||[]).filter(function(l){return!l.status||l.status==="New Lead";}).length;b.textContent=n;b.style.background=n>0?"#ff3b30":"#34c759";b.style.display="";}
function doFindBuyers(btn){var state=btn.dataset.state;var cities=btn.dataset.cities?btn.dataset.cities.split("|"):[state];populateBuyersForState(state,cities);}
function populateLeadsForState(state){toast("Scanning leads for "+state+"...","");fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({states:[state],limit:50})}).then(function(r){return r.json();}).then(function(d){toast((d.added||0)+" leads added for "+state,"success");loadLeadsFromAPI();}).catch(function(){toast("Scan queued","");});}
async function populateBuyersForState(state,cities){toast("Finding buyers in "+state+"...","");await runBuyerFinder(state,cities&&cities.length?cities:[state]);}
// 3. BULK SEND
function openBulkSendToBuyer(buyerId){
  var buyer=(APP.buyers||[]).find(function(b){return b.id===buyerId;});
  if(!buyer)return toast("Buyer not found","error");
  var matches=(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[buyer]).length>0;}).sort(function(a,b){return(b.spread||0)-(a.spread||0);}).slice(0,30);
  if(!matches.length)return toast("No matching deals for "+buyer.name,"error");
  var ex=document.getElementById("bulk-send-modal");if(ex)ex.remove();
  var rows=matches.map(function(l){
    var rid=l.ref_id||getDealRefId(l);
    var roi=l.arv&&l.offer?Math.round(((l.arv-l.offer-(l.repairs||0))/l.offer)*100):0;
    return "<tr style=\"border-bottom:1px solid #f0f0f0\">"+
      "<td style=\"padding:8px 6px;text-align:center\"><input type=\"checkbox\" checked data-deal-id=\""+l.id+"\" style=\"width:15px;height:15px\"></td>"+
      "<td style=\"padding:8px 6px\"><span style=\"background:#1a1a2e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700\">"+rid+"</span></td>"+
      "<td style=\"padding:8px 6px;font-size:12px\">"+(l.type||"SFR")+" · "+(l.state||"")+"</td>"+
      "<td style=\"padding:8px 6px;font-size:12px;color:#0071e3;font-weight:600\">$"+(l.arv||0).toLocaleString()+"</td>"+
      "<td style=\"padding:8px 6px;font-size:12px;color:#ff9500;font-weight:600\">$"+(l.offer||0).toLocaleString()+"</td>"+
      "<td style=\"padding:8px 6px;font-size:12px;color:#5e5ce6\">"+(l.repairs||0).toLocaleString()+"</td>"+
      "<td style=\"padding:8px 6px;font-size:13px;font-weight:700;color:#34c759\">$"+(l.spread||0).toLocaleString()+"</td>"+
      "<td style=\"padding:8px 6px;font-size:12px;color:#5e5ce6\">"+roi+"%</td>"+
    "</tr>";
  }).join("");
  var modal=document.createElement("div");modal.id="bulk-send-modal";
  modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px";
  modal.onclick=function(e){if(e.target===modal)modal.remove();};
  modal.innerHTML="<div style=\"background:#fff;border-radius:16px;width:95vw;max-width:1100px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.4)\">"+
    "<div style=\"padding:18px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center\">"+
    "<div><div style=\"font-size:17px;font-weight:700\">🚀 Send Deals → "+buyer.name+"</div>"+
    "<div style=\"font-size:12px;color:#86868b\">"+matches.length+" best deals · select · click Send</div></div>"+
    "<div style=\"display:flex;gap:8px;align-items:center\">"+
    "<button onclick=\"toggleAllBulkDeals()\" style=\"padding:7px 14px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px\">☑ All</button>"+
    "<button onclick=\"confirmBulkSendToBuyer('"+buyer.id+"')\" style=\"padding:9px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700\">📧 Send</button>"+
    "<button onclick=\"closeBulkModal()\" style=\"background:none;border:none;font-size:24px;cursor:pointer;color:#86868b;line-height:1\">✕</button>"+
    "</div></div>"+
    "<div style=\"overflow-y:auto;flex:1\"><table style=\"width:100%;border-collapse:collapse\">"+
    "<thead style=\"position:sticky;top:0;background:#f5f5f7;z-index:1\"><tr>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">✓</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">REF#</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">TYPE·STATE</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">ARV</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">OFFER</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">REPAIRS</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">SPREAD</th>"+
    "<th style=\"padding:9px 6px;font-size:10px;color:#86868b;text-align:left\">ROI</th>"+
    "</tr></thead><tbody>"+rows+"</tbody></table></div>"+
    "<div style=\"padding:12px 24px;border-top:1px solid #f0f0f0;background:#f9f9fb;border-radius:0 0 16px 16px;font-size:11px;color:#86868b\">🔒 Address revealed only after buyer confirms</div>"+
  "</div>";
  document.body.appendChild(modal);
}
function toggleAllBulkDeals(){var b=document.querySelectorAll("#bulk-send-modal input[type=checkbox]");var a=Array.from(b).every(function(x){return x.checked;});b.forEach(function(x){x.checked=!a;});}
async function confirmBulkSendToBuyer(id){
  var b=(APP.buyers||[]).find(function(x){return x.id===id;});
  if(!b)return;
  if(!b.email){toast("Add email for "+b.name+" first","error");return;}
  var c=Array.from(document.querySelectorAll("#bulk-send-modal input[type=checkbox]:checked"));
  if(!c.length){toast("Select at least one deal","error");return;}
  var ds=c.map(function(x){return x.dataset.dealId;});
  toast("Sending "+ds.length+" deals to "+b.name+"...","");
  try{
    await fetch("/api/buyers/"+id+"/send-deals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dealIds:ds})});
    closeBulkModal();toast("Sent "+ds.length+" deals to "+b.name,"success");
  }catch(e){toast("Error: "+e.message,"error");}
}
// 4. BUYER FINDER
var _bfRunning=false;
async function runBuyerFinder(state,cities){
  if(_bfRunning){toast("Finder already running","");return;}
  _bfRunning=true;
  var el=document.getElementById("buyer-finder-status");
  var qs=["we buy houses","cash home buyers","real estate investors","wholesale real estate","fix and flip buyers"];
  var found=[],saved=0;
  for(var ci=0;ci<cities.length;ci++){
    var city=cities[ci];
    for(var qi=0;qi<qs.length;qi++){
      var q=qs[qi]+" "+city+" "+state;
      if(el)el.textContent="Searching: "+q+"...";
      try{
        var res=await fetch("/api/buyer-search?q="+encodeURIComponent(q)+"&state="+state+"&city="+encodeURIComponent(city));
        if(!res.ok)continue;
        var data=await res.json();
        (data.results||[]).forEach(function(s){
          var txt=(s.snippet||"")+" "+(s.title||"");
          if(!["cash","investor","wholesale","buyers list","we buy"].some(function(k){return txt.toLowerCase().includes(k);}))return;
          var ph=(txt.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g)||[]);
          var em=(txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)||[]);
          found.push({name:s.title||q,phone:ph[0]||"",email:em[0]||"",city:city,state:state,website:s.url||""});
        });
      }catch(e){}
      await new Promise(function(r){setTimeout(r,200);});
    }
  }
  var seen={},deduped=[];
  found.forEach(function(b){var k=b.phone||b.email||(b.website.split("/")[2]||b.name).replace("www.","");if(k&&!seen[k]){seen[k]=true;deduped.push(b);}});
  if(el)el.textContent="Saving "+deduped.length+" buyers...";
  for(var i=0;i<deduped.length;i++){
    try{
      var r=await fetch("/api/buyers",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:deduped[i].name,phone:deduped[i].phone,email:deduped[i].email,
          city:deduped[i].city,state:deduped[i].state,states:[deduped[i].state],
          buyTypes:["SFR","Multi"],website:deduped[i].website})});
      if(r.ok)saved++;
    }catch(e){}
  }
  _bfRunning=false;
  if(typeof loadMatchingData==="function")await loadMatchingData();
  if(el)el.textContent="Done! Saved "+saved+" buyers for "+state;
  toast("Found "+saved+" buyers in "+state,"success");
}
// 5. OVERRIDE renderBuyers with bulk send buttons
renderBuyers = function(){
  var buyers=APP.buyers||[];
  if(!buyers.length)return "<div style=\"text-align:center;padding:60px;color:#86868b\"><div style=\"font-size:40px;margin-bottom:12px\">👥</div><div style=\"font-size:15px;font-weight:600;margin-bottom:12px\">No buyers yet</div><button class=\"btn btn-dark\" onclick=\"openAddBuyer()\"">+ Add First Buyer</button></div>";
  var cards=buyers.map(function(b){
    var states=(b.states&&b.states.length)?b.states.join(", "):(b.state||"Any");
    var types=(b.buyTypes||[]).join(", ")||"Any";
    var maxP=b.maxPrice?"$"+Number(b.maxPrice).toLocaleString():"Any";
    var minP=b.minPrice?"$"+Number(b.minPrice).toLocaleString():"$0";
    var sc=b.score||75,scC=sc>=80?"#34c759":sc>=50?"#ff9500":"#ff3b30";
    var mc=(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[b]).length>0;}).length;
    return "<div style=\"background:#fff;border:1px solid #e5e5ea;border-radius:14px;padding:16px\">"+
      "<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px\">"+
      "<div><div style=\"font-size:14px;font-weight:700\">"+b.name+"</div>"+
      "<div style=\"font-size:11px;color:#86868b\">"+(b.city||"")+(b.state?", "+b.state:"")+(b.strategy?" · "+b.strategy:"")+"</div></div>"+
      "<div style=\"text-align:right\"><div style=\"font-size:14px;font-weight:700;color:"+scC+"\">"+sc+"</div><div style=\"font-size:9px;color:#86868b\">trust</div></div></div>"+
      "<div style=\"background:#f9f9fb;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;line-height:1.8\">"+
      "<div>📞 "+(b.phone?"<strong>"+b.phone+"</strong>":"<span style=\"color:#86868b\">No phone</span>")+"</div>"+
      "<div>✉️ "+(b.email?"<strong>"+b.email+"</strong>":"<span style=\"color:#ff9500;font-weight:600\">No email</span> <button data-bid=\""+b.id+"\" onclick=\"openBuyerDetail(this.dataset.bid)\" style=\"background:none;border:none;color:#0071e3;cursor:pointer;font-size:11px;padding:0\">Add →</button>")+"</div></div>"+
      "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px;font-size:11px\">"+
      "<div>🏠 Types: <strong>"+types+"</strong></div>"+
      "<div>💰 Budget: <strong>"+minP+"–"+maxP+"</strong></div>"+
      "<div>📍 States: <strong>"+states+"</strong></div>"+
      "<div style=\"color:"+(mc>0?"#0071e3":"#86868b")+"\">🔎 "+mc+" deals match</div></div>"+
      "<div style=\"display:flex;gap:6px\">"+
      "<button data-bid=\""+b.id+"\" onclick=\"editBuyer(this.dataset.bid)\" style=\"flex:1;padding:7px;background:#f5f5f7;border:none;border-radius:8px;cursor:pointer;font-size:11px\">✏️ Edit</button>"+
      "<button data-bid=\""+b.id+"\" onclick=\"openBulkSendToBuyer(this.dataset.bid)\" style=\"flex:2;padding:7px;background:#1a1a2e;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600\">🚀 Send "+Math.min(mc,30)+" Deals</button>"+
      "</div></div>";
  }).join("");
  return "<div style=\"max-width:1100px\">"+
    "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:20px\">"+
    "<div><div style=\"font-size:18px;font-weight:700\">💼 Buyers Database</div>"+
    "<div style=\"font-size:12px;color:#86868b\">"+buyers.length+" buyers · "+(APP.leads||[]).length.toLocaleString()+" leads</div></div>"+
    "<div style=\"display:flex;gap:8px\">"+
    "<button class=\"btn btn-dark\" onclick=\"openAddBuyer()\">+ Add Buyer</button>"+
    "<button class=\"btn btn-sm\" style=\"background:#f5f5f7\" onclick=\"loadMatchingData()\">🔄 Sync</button>"+
    "</div></div>"+
    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px\">"+cards+"</div>"+
  "</div>";
};
// 6. OVERRIDE renderAllStates with working lead/buyer counts
renderAllStates = function(){
  var leads=APP.leads||[],buyers=APP.buyers||[];
  var lc={},bc={};
  leads.forEach(function(l){if(l.state)lc[l.state]=(lc[l.state]||0)+1;});
  buyers.forEach(function(b){if(b.state)bc[b.state]=(bc[b.state]||0)+1;});
  var states=[["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"]];
  var topCities={TX:["Dallas","Houston","Austin","San Antonio"],CA:["Los Angeles","San Diego","San Francisco"],FL:["Miami","Orlando","Tampa","Jacksonville"],GA:["Atlanta","Augusta","Savannah"],AZ:["Phoenix","Tucson","Scottsdale"],OH:["Columbus","Cleveland","Cincinnati"],NC:["Charlotte","Raleigh","Durham"],TN:["Nashville","Memphis","Knoxville"],IL:["Chicago","Rockford","Peoria"],NV:["Las Vegas","Reno"],CO:["Denver","Colorado Springs"],NY:["New York","Buffalo","Albany"],PA:["Philadelphia","Pittsburgh"],TX:["Dallas","Houston","Austin"],VA:["Richmond","Virginia Beach"],WA:["Seattle","Spokane"],MO:["Kansas City","St. Louis"],MI:["Detroit","Grand Rapids"],IN:["Indianapolis","Fort Wayne"],KY:["Louisville","Lexington"],OK:["Oklahoma City","Tulsa"],MS:["Jackson","Gulfport"],AL:["Birmingham","Montgomery"],NE:["Omaha","Lincoln"]};
  var search=APP._stateSearch||"";
  var filtered=states.filter(function(s){if(!search)return true;return s[0].toLowerCase().includes(search.toLowerCase())||s[1].toLowerCase().includes(search.toLowerCase());});
  var cards=filtered.map(function(s){
    var code=s[0],name=s[1];
    var ll=lc[code]||0,bb=bc[code]||0;
    var cities=(topCities[code]||[name]).join("|");
    return "<div style=\"background:#fff;border:1px solid "+(ll>0?"#34c759":"#e5e5ea")+";border-radius:12px;padding:14px\">"+
      "<div style=\"display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px\">"+
      "<div><div style=\"font-size:20px;font-weight:800;color:#1a1a2e\">"+code+"</div>"+
      "<div style=\"font-size:10px;color:#86868b\">"+name+"</div></div>"+
      "<div style=\"text-align:right\">"+
      "<div style=\"font-size:11px;font-weight:600;color:"+(ll>0?"#34c759":"#86868b")+"\">"+(ll>0?ll.toLocaleString()+" leads":"0 leads")+"</div>"+
      "<div style=\"font-size:11px;color:"+(bb>0?"#0071e3":"#86868b")+"\">"+(bb>0?bb+" buyers":"0 buyers")+"</div>"+
      "</div></div>"+
      "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:5px\">"+
      "<button data-state=\""+code+"\" onclick=\"populateLeadsForState(this.dataset.state)\" style=\"padding:6px 4px;background:#1a1a2e;color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:10px;font-weight:600\">📥 Get Leads</button>"+
      "<button data-state=\""+code+"\" data-cities=\""+cities+"\" onclick=\"doFindBuyers(this)\" style=\"padding:6px 4px;background:#f0f6ff;color:#0071e3;border:1px solid #c8deff;border-radius:7px;cursor:pointer;font-size:10px;font-weight:600\">👥 Find Buyers</button>"+
      "</div></div>";
  }).join("");
  return "<div style=\"max-width:1200px\">"+
    "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px\">"+
    "<div><div style=\"font-size:18px;font-weight:700\">🌎 All 50 States</div>"+
    "<div style=\"font-size:12px;color:#86868b\">"+leads.length.toLocaleString()+" leads · "+buyers.length+" buyers</div></div>"+
    "<input placeholder=\"Search states...\" oninput=\"APP._stateSearch=this.value;render()\" value=\""+search+"\" style=\"padding:8px 14px;border:1px solid #e5e5ea;border-radius:20px;font-size:12px;outline:none;width:180px\">"+
    "</div>"+
    "<div id=\"buyer-finder-status\" style=\"min-height:20px;font-size:12px;color:#5e5ce6;margin-bottom:10px;font-weight:500\"></div>"+
    "<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px\">"+cards+"</div>"+
  "</div>";
};
// 7. BOOT
function removeBuyBoxesNav(){document.querySelectorAll("[onclick*=buyboxes],.nav-item").forEach(function(el){var t=(el.textContent||"").toLowerCase().trim();if((t==="buy boxes"||t.includes("buy box manager"))&&!t.includes("buyers&"))el.style.display="none";});}
removeBuyBoxesNav();
if(!window._bbo){window._bbo=new MutationObserver(removeBuyBoxesNav);window._bbo.observe(document.body,{childList:true,subtree:true});}
if(APP&&APP.leads&&APP.leads.length){APP.leads=assignRefIds(APP.leads);APP.filtered=APP.filtered||APP.leads;}
if(typeof updateLeadsBadge==="function")updateLeadsBadge();
if(["buyers","states"].indexOf(APP.page)>-1)render();
console.log("WholesaleOS Patch v4 FINAL loaded — renderBuyers+renderAllStates overridden");