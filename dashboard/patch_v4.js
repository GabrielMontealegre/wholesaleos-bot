// WholesaleOS Patch v4 CLEAN
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
function openBulkSendToBuyer(buyerId){
  var buyer=(APP.buyers||[]).find(function(b){return b.id===buyerId;});
  if(!buyer)return toast("Buyer not found","error");
  var matches=(APP.leads||[]).filter(function(l){return matchBuyersToLead(l,[buyer]).length>0;}).sort(function(a,b){return(b.spread||0)-(a.spread||0);}).slice(0,30);
  if(!matches.length)return toast("No matching deals","error");
  var ex=document.getElementById("bulk-send-modal");if(ex)ex.remove();
  var modal=document.createElement("div");modal.id="bulk-send-modal";
  modal.style.cssText="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px";
  modal.onclick=function(e){if(e.target===modal)modal.remove();};
  var rows=matches.map(function(l){
    var rid=l.ref_id||getDealRefId(l);
    var roi=l.arv&&l.offer?Math.round(((l.arv-l.offer-(l.repairs||0))/l.offer)*100):0;
    return "<tr style=\"border-bottom:1px solid #f0f0f0\"><td style=\"padding:8px\"><input type=\"checkbox\" checked data-deal-id=\""+l.id+"\" style=\"width:15px;height:15px\"></td><td><span style=\"background:#1a1a2e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px\">"+(rid)+"</span></td><td style=\"font-size:12px\">"+(l.type||"SFR")+" "+l.state+"</td><td style=\"color:#0071e3;font-weight:600\">$"+(l.arv||0).toLocaleString()+"</td><td style=\"color:#ff9500;font-weight:600\">$"+(l.offer||0).toLocaleString()+"</td><td style=\"color:#34c759;font-weight:700\">$"+(l.spread||0).toLocaleString()+"</td><td style=\"color:#5e5ce6\">"+roi+"%</td></tr>";
  }).join("");
  modal.innerHTML="<div style=\"background:#fff;border-radius:16px;width:95vw;max-width:1000px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,0.4)\"><div style=\"padding:18px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center\"><div><div style=\"font-size:17px;font-weight:700\">Send Deals to "+buyer.name+"</div><div style=\"font-size:12px;color:#86868b\">"+matches.length+" best matching deals</div></div><div style=\"display:flex;gap:8px;align-items:center\"><button onclick=\"toggleAllBulkDeals()\" style=\"padding:7px 14px;border:1px solid #e5e5ea;border-radius:8px;background:#fff;cursor:pointer;font-size:12px\">All</button><button onclick=\"confirmBulkSendToBuyer('"+buyer.id+"')\" style=\"padding:9px 20px;background:#1a1a2e;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700\">Send</button><button onclick=\"closeBulkModal()\" style=\"background:none;border:none;font-size:24px;cursor:pointer;color:#86868b;line-height:1\">X</button></div></div><div style=\"overflow-y:auto;flex:1\"><table style=\"width:100%;border-collapse:collapse\"><thead style=\"position:sticky;top:0;background:#f5f5f7;z-index:1\"><tr><th style=\"padding:9px;font-size:10px;color:#86868b;text-align:left\">CHK</th><th>REF</th><th>TYPE</th><th>ARV</th><th>OFFER</th><th>SPREAD</th><th>ROI</th></tr></thead><tbody>"+rows+"</tbody></table></div><div style=\"padding:12px 24px;border-top:1px solid #f0f0f0;background:#f9f9fb;border-radius:0 0 16px 16px;font-size:11px;color:#86868b\">No address revealed until buyer confirms interest</div></div>";
  document.body.appendChild(modal);
}
function toggleAllBulkDeals(){var b=document.querySelectorAll("#bulk-send-modal input[type=checkbox]");var a=Array.from(b).every(function(x){return x.checked;});b.forEach(function(x){x.checked=!a;});}
async function confirmBulkSendToBuyer(id){var b=(APP.buyers||[]).find(function(x){return x.id===id;});if(!b||!b.email){toast("Add email first","error");return;}var c=Array.from(document.querySelectorAll("#bulk-send-modal input[type=checkbox]:checked"));var ds=c.map(function(x){return x.dataset.dealId;});try{await fetch("/api/buyers/"+id+"/send-deals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dealIds:ds})});closeBulkModal();toast("Sent "+ds.length+" deals","success");}catch(e){toast("Error:"+e.message,"error");}}
var _bfRunning=false;
async function runBuyerFinder(state,cities){if(_bfRunning){toast("Already running","");return;}_bfRunning=true;var statusEl=document.getElementById("buyer-finder-status");var qs=["we buy houses","cash home buyers","real estate investors","wholesale real estate","fix and flip buyers"];var found=[],saved=0;for(var ci=0;ci<cities.length;ci++){var city=cities[ci];for(var qi=0;qi<qs.length;qi++){var q=qs[qi]+" "+city+" "+state;if(statusEl)statusEl.textContent="Searching: "+q+"...";try{var res=await fetch("/api/buyer-search?q="+encodeURIComponent(q)+"&state="+state+"&city="+encodeURIComponent(city));if(!res.ok)continue;var data=await res.json();(data.results||[]).forEach(function(s){var txt=(s.snippet||"")+" "+(s.title||"");if(!["cash","investor","wholesale","buyers list"].some(function(k){return txt.toLowerCase().includes(k);}))return;var ph=(txt.match(/\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/)||[]);var em=(txt.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)||[]);found.push({name:s.title||q,phone:ph[0]||"",email:em[0]||"",city:city,state:state,website:s.url||""});});}catch(e){}await new Promise(function(r){setTimeout(r,200);});}}var seen={},deduped=[];found.forEach(function(b){var k=b.phone||b.email||(b.website.split("/")[2]||b.name);if(k&&!seen[k]){seen[k]=true;deduped.push(b);}});if(statusEl)statusEl.textContent="Saving "+deduped.length+" buyers...";for(var i=0;i<deduped.length;i++){try{var r=await fetch("/api/buyers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:deduped[i].name,phone:deduped[i].phone,email:deduped[i].email,city:deduped[i].city,state:deduped[i].state,states:[deduped[i].state],buyTypes:["SFR","Multi"],website:deduped[i].website})});if(r.ok)saved++;}catch(e){}}
_bfRunning=false;await loadMatchingData();if(statusEl)statusEl.textContent="Done! Saved "+saved+" buyers for "+state;toast("Found "+saved+" buyers in "+state,"success");}
function doFindBuyers(btn){var state=btn.dataset.state;var cities=btn.dataset.cities?btn.dataset.cities.split("|"):[state];populateBuyersForState(state,cities);}
async function populateBuyersForState(state,cities){toast("Finding buyers in "+state+"...","");await runBuyerFinder(state,cities&&cities.length?cities:[state]);}
function populateLeadsForState(state){toast("Scanning leads for "+state+"...","");fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({states:[state],limit:50})}).then(function(r){return r.json();}).then(function(d){toast((d.added||0)+" leads added for "+state,"success");loadLeadsFromAPI();}).catch(function(){toast("Scan queued","");});}
// Remove Buy Boxes nav
(function(){function r(){document.querySelectorAll("[onclick*=buyboxes],.nav-item").forEach(function(el){var t=(el.textContent||"").toLowerCase().trim();if((t==="buy boxes"||t.includes("buy box manager"))&&!t.includes("buyers&"))el.style.display="none";});}r();if(!window._bbo){window._bbo=new MutationObserver(r);window._bbo.observe(document.body,{childList:true,subtree:true});}})();
// Apply ref IDs on boot
if(APP&&APP.leads&&APP.leads.length){APP.leads=assignRefIds(APP.leads);APP.filtered=APP.filtered||APP.leads;}
if(typeof updateLeadsBadge==="function")updateLeadsBadge();
console.log("Patch v4 CLEAN loaded");