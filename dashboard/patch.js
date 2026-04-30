// WholesaleOS patch v16.3 — external file, no HTML parsing issues
(function(){
"use strict";
var wst=document.createElement("div");
wst.id="wst16";
wst.style.cssText="position:fixed;bottom:24px;right:24px;z-index:99999;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:500;display:none;max-width:400px;";
document.body.appendChild(wst);
window._wst=function(m,ok){
  wst.textContent=m;
  wst.style.background=ok?"#14532d":"#7f1d1d";
  wst.style.color="#fff";
  wst.style.display="block";
  clearTimeout(window._wstT);
  window._wstT=setTimeout(function(){wst.style.display="none";},4500);
};
var css=document.createElement("style");
css.textContent=
  "table td:nth-child(2){min-width:260px;max-width:420px;white-space:normal!important;word-break:break-word!important}"
 +"#plb16{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0 4px}"
 +"#rcs16{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-top:12px}"
 +"#sss16{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px;margin-top:12px}"
 +"#rcs16 h4{color:#a78bfa;font-size:13px;text-transform:uppercase;margin:0 0 10px}"
 +"#sss16 h4{color:#38bdf8;font-size:13px;text-transform:uppercase;margin:0 0 10px}";
document.head.appendChild(css);
var LS="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:5px 12px;font-size:12px;text-decoration:none;display:inline-flex;align-items:center;cursor:pointer;";
window._injectLinks=function(l){
  if(!l||!l.id)return;
  var m=document.querySelector(".lead-modal,[id*=lead-detail],[id*=lead-modal]");
  if(!m)return;
  var ob=document.getElementById("plb16");if(ob)ob.remove();
  var fa=encodeURIComponent([l.address,l.city,l.state,l.zip].filter(Boolean).join(", "));
  var as=(l.address||"").replace(/\s+/g,"-").replace(/[^a-zA-Z0-9-]/g,"");
  var cs=(l.city||"").replace(/\s+/g,"-");
  var zU=l.zillow_url||("https://www.zillow.com/homes/"+as+"-"+cs+"-"+(l.state||"")+"_rb/");
  var rU=l.redfin_url||("https://www.redfin.com/search?location="+fa);
  var mU=l.maps_url||("https://maps.google.com/?q="+fa);
  var lid=l.id;
  var bar=document.createElement("div");bar.id="plb16";bar.style.cssText="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0 4px;";
  function mkA(href,color,txt){var a=document.createElement("a");a.href=href;a.target="_blank";a.style.cssText=LS+"color:"+color;a.textContent=txt;return a;}
  function mkB(id,bg,txt,fn){var b=document.createElement("button");b.id=id;b.style.cssText=LS+"color:#fff;background:"+bg+";border:none;font-weight:600;";b.textContent=txt;b.onclick=fn;return b;}
  bar.appendChild(mkA(mU,"#60a5fa","Maps"));
  bar.appendChild(mkA(zU,"#34d399","Zillow"));
  bar.appendChild(mkA(rU,"#f97316","Redfin"));
  bar.appendChild(mkA("https://www.realauction.com","#a78bfa","Auction"));
  bar.appendChild(mkB("bc-"+lid,"#6366f1","Get Real Comps",function(){window._getComps(lid);}));
  bar.appendChild(mkB("bs-"+lid,"#0f766e","Seller Script",function(){window._getScript(lid);}));
  var te=m.querySelector("h2,h3");
  if(te&&te.parentNode)te.parentNode.insertBefore(bar,te.nextSibling);
  else m.insertBefore(bar,m.firstChild);
};
window._injectComps=function(d){
  var m=document.querySelector(".lead-modal,[id*=lead-detail],[id*=lead-modal]");
  if(!m)return;
  var ob=document.getElementById("rcs16");if(ob)ob.remove();
  if(!d||!d.comps||!d.comps.length)return;
  var wrap=document.createElement("div");wrap.id="rcs16";
  var h4=document.createElement("h4");h4.textContent="Real Comps ("+d.comp_count+") — LLaMA Analysis";wrap.appendChild(h4);
  if(d.arv_summary){var ab=document.createElement("div");ab.style.cssText="background:#0f172a;border:1px solid #a78bfa;border-radius:8px;padding:10px;margin-bottom:10px;color:#c4b5fd;font-size:13px;";ab.textContent=d.arv_summary;wrap.appendChild(ab);}
  d.comps.forEach(function(c){
    var row=document.createElement("div");row.style.cssText="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #0f172a;font-size:12px;";
    var left=document.createElement("div");
    var adr=document.createElement("div");adr.style.color="#e2e8f0";adr.textContent=c.address||"Unknown";left.appendChild(adr);
    var meta=document.createElement("div");meta.style.cssText="color:#64748b;font-size:10px;";meta.textContent=[c.source,c.soldDate?c.soldDate.slice(0,10):"",c.sqft?c.sqft.toLocaleString()+"sqft":"",c.beds?c.beds+"bd/"+c.baths+"ba":""].filter(Boolean).join(" · ");left.appendChild(meta);
    var price=document.createElement("div");price.style.cssText="color:#34d399;font-weight:600;white-space:nowrap;";price.textContent="$"+(c.price||0).toLocaleString();
    row.appendChild(left);row.appendChild(price);wrap.appendChild(row);
  });
  var n=m.querySelector("[id*=notes],[class*=notes]");
  if(n)n.parentNode.insertBefore(wrap,n);else m.appendChild(wrap);
};
window._injectScript=function(sc,cat){
  var m=document.querySelector(".lead-modal,[id*=lead-detail],[id*=lead-modal]");
  if(!m||!sc)return;
  var ob=document.getElementById("sss16");if(ob)ob.remove();
  var wrap=document.createElement("div");wrap.id="sss16";
  var h4=document.createElement("h4");h4.textContent="Seller Script — "+(cat||"General");wrap.appendChild(h4);
  function addDiv(txt,bl,tc){var d=document.createElement("div");d.style.cssText="background:#0f172a;border-left:3px solid "+bl+";padding:8px 12px;border-radius:4px;color:"+(tc||"#e2e8f0")+";font-size:13px;margin:4px 0;";d.textContent=txt;wrap.appendChild(d);}
  function addLabel(txt){var d=document.createElement("div");d.style.cssText="color:#64748b;font-size:11px;text-transform:uppercase;margin:8px 0 3px;";d.textContent=txt;wrap.appendChild(d);}
  if(sc.opening_line){addLabel("Opening");addDiv(sc.opening_line,"#22d3ee","#67e8f9");}
  if(sc.questions&&sc.questions.length){addLabel("Questions");sc.questions.forEach(function(q,i){addDiv((i+1)+". "+q,"#38bdf8");});}
  if(sc.key_intel&&sc.key_intel.length){addLabel("Key Intel");sc.key_intel.forEach(function(k){var d=document.createElement("div");d.style.cssText="background:#14532d;border-left:3px solid #22c55e;padding:6px 10px;border-radius:4px;color:#bbf7d0;font-size:12px;margin:4px 0;";d.textContent="• "+k;wrap.appendChild(d);});}
  if(sc.closing_line){addLabel("Closing");addDiv(sc.closing_line,"#4ade80","#86efac");}
  var n=m.querySelector("[id*=notes],[class*=notes]");
  if(n)n.parentNode.insertBefore(wrap,n);else m.appendChild(wrap);
};
window._getComps=function(lid){
  var btn=document.getElementById("bc-"+lid);
  if(btn){btn.textContent="Fetching...";btn.disabled=true;}
  fetch("/api/leads/"+lid+"/comps")
    .then(function(r){return r.json();})
    .then(function(d){
      if(btn){btn.textContent=d.comp_count?"Got "+d.comp_count+" comps":"No comps";btn.disabled=false;}
      if(d.error){window._wst("Comps: "+d.error,false);return;}
      var lead=APP&&APP.leads&&APP.leads.find(function(l){return l.id===lid;});
      if(lead){Object.assign(lead,d);if(APP.selectedLead&&APP.selectedLead.id===lid)Object.assign(APP.selectedLead,d);}
      window._injectComps(d);
      window._wst("Real ARV: $"+Math.round(d.arv||0).toLocaleString()+" — "+d.comp_count+" comps from Redfin+Zillow",true);
    })
    .catch(function(e){window._wst("Error: "+e.message,false);if(btn){btn.textContent="Get Real Comps";btn.disabled=false;}});
};
window._getScript=function(lid){
  var btn=document.getElementById("bs-"+lid);
  if(btn){btn.textContent="Generating...";btn.disabled=true;}
  fetch("/api/leads/"+lid+"/seller-script")
    .then(function(r){return r.json();})
    .then(function(d){
      if(btn){btn.textContent="Script Ready ✓";btn.disabled=false;}
      if(d.error){window._wst("Script: "+d.error,false);return;}
      var lead=APP&&APP.leads&&APP.leads.find(function(l){return l.id===lid;});
      if(lead){lead.seller_script=d.script;lead.seller_script_category=d.category;if(APP.selectedLead&&APP.selectedLead.id===lid){APP.selectedLead.seller_script=d.script;APP.selectedLead.seller_script_category=d.category;}}
      window._injectScript(d.script,d.category);
      window._wst("Seller script ready for "+(d.category||"this lead"),true);
    })
    .catch(function(e){window._wst("Error: "+e.message,false);if(btn){btn.textContent="Seller Script";btn.disabled=false;}});
};
var _ha=0;
function _h(){
  _ha++;
  if(typeof window.renderLeadDetail!=="function"){if(_ha<30)setTimeout(_h,500);return;}
  var _o=window.renderLeadDetail;
  window.renderLeadDetail=function(){
    var args=Array.prototype.slice.call(arguments);
    _o.apply(this,args);
    setTimeout(function(){
      var lead=APP.selectedLead;
      if(typeof lead==="string"){lead=(APP.leads||[]).find(function(l){return l.id===lead;})||null;}
      if(!lead||typeof lead!=="object")return;
      window._injectLinks(lead);
      if(lead.comps&&lead.comps.length)window._injectComps(lead);
      if(lead.seller_script)window._injectScript(lead.seller_script,lead.seller_script_category);
      document.querySelectorAll("[class*=fit],[class*=score]").forEach(function(el){if(el.textContent.indexOf("NaN")>-1)el.textContent=el.textContent.replace(/NaN%?/g,"N/A");});
      document.querySelectorAll("table tbody tr td:nth-child(2)").forEach(function(td){td.style.whiteSpace="normal";td.style.overflow="visible";td.style.textOverflow="unset";});
    },400);
  };
  console.log("[v16.3] renderLeadDetail hooked OK after "+(_ha*500)+"ms");
}
setTimeout(_h,300);
console.log("[v16.3] patch.js loaded OK");

})();
