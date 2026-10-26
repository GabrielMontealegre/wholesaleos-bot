'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WOSAssistantModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var STAGES = ['finding_buyer', 'offer_out', 'under_contract', 'buyer_assigned', 'closed', 'dead'];
  function invalid() { throw Error('assistant_sheet_invalid'); }
  function str(value, max, nullable) {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value)) invalid();
    return value;
  }
  function iso(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) invalid();
    return value;
  }
  function list(value, max) {
    if (!Array.isArray(value) || value.length > max) invalid();
    for (var i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) invalid();
    return value;
  }
  function identifier(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) invalid(); return value; }
  function day(value, nullable) {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) invalid();
    return value;
  }
  function safeURL(value) {
    if (value === null) return null;
    str(value,2048);
    if (/[\x00-\x20\x7f]/.test(value)) invalid();
    var url = new URL(value);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) invalid();
    return url.href;
  }
  function amount(value) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) invalid(); return value; }
  function phoneLink(value, body) {
    if (typeof value !== 'string' || !/^\+?[\d ()-]+$/.test(value)) return null;
    var number = value.replace(/[ ()-]/g, '');
    if (!/^\+?\d{7,15}$/.test(number)) return null;
    if (body === undefined) return 'tel:' + number;
    if (typeof body !== 'string' || body.length > 8000) return null;
    try { return 'sms:' + number + '?&body=' + encodeURIComponent(body); } catch (_) { return null; }
  }
  function project(receipt) {
    if (receipt === null) return null;
    try {
      var nodes = 0;
      function plain(value, depth) {
        if (++nodes > 100000 || depth > 20) invalid();
        if (value === null || ['string','boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return;
        if (!value || typeof value !== 'object' || ![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value))) invalid();
        Reflect.ownKeys(value).forEach(function(key){var d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string' || !Object.hasOwn(d,'value')) invalid();plain(d.value,depth+1);});
      }
      plain(receipt,0);
      return build(receipt);
    } catch (_) { invalid(); }
  }
  function build(receipt) {
    if (!receipt || receipt.source_kind !== 'assistant_snapshot_import' || !/^[a-f0-9]{64}$/.test(receipt.id) || !/^[a-f0-9]{64}$/.test(receipt.file_sha256) ||
        typeof receipt.filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.json$/.test(receipt.filename) || receipt.filename.includes('..')) invalid();
    var source = receipt.snapshot;
    if (!source || source.schema !== 'wos-assistant-snapshot' || source.version !== 1 || receipt.generated_at !== source.generated_at) invalid();
    iso(receipt.imported_at); iso(source.generated_at);
    if (Date.parse(source.generated_at) > Date.parse(receipt.imported_at)) invalid();
    var ids = new Set(), dealIds = new Set();
    function captured(value) { iso(value); if (Date.parse(value)>Date.parse(source.generated_at)) invalid(); return value; }
    function capturedDay(value, nullable) { day(value,nullable); if (value!==null && value>source.generated_at.slice(0,10)) invalid(); return value; }
    function unique(value) { identifier(value); if (ids.has(value)) invalid(); ids.add(value); return value; }
    function provenance(file) { return { source_kind: 'assistant_snapshot_import', generated_at: source.generated_at, source_file: file || receipt.filename, reported: true }; }
    function ref(value) { if (value !== null && !dealIds.has(identifier(value))) invalid(); return value; }
    var deals = list(source.deals, 1000).map(function (d) {
      unique(d.id); dealIds.add(d.id);
      if (!STAGES.includes(d.stage) || typeof d.source_file !== 'string' || !/^deal-brains\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(d.source_file) || d.source_file.includes('..')) invalid();
      var numbers = {}, keys = ['ask','seller_number','our_offer','target','value_fixed','repairs','fee_estimate_low','fee_estimate_high'];
      keys.forEach(function (key) { numbers[key] = amount(d.numbers[key]); });
      numbers.buyer_number = { amount: amount(d.numbers.buyer_number.amount), buyer: str(d.numbers.buyer_number.buyer, 200, true) };
      if (numbers.fee_estimate_low !== null && numbers.fee_estimate_high !== null && numbers.fee_estimate_low > numbers.fee_estimate_high) invalid();
      return { id: d.id, name: str(d.name, 300), stage: d.stage, updated_at: captured(d.updated_at), numbers: numbers,
        people: list(d.people,100).map(function (p) { return { name:str(p.name,200),role:str(p.role,300),phone:str(p.phone,80,true),email:str(p.email,320,true) }; }),
        needs_gabriel:str(d.needs_gabriel,2000,true),next_seller:str(d.next_seller,2000,true),next_buyer:str(d.next_buyer,2000,true),
        log:list(d.log,1000).map(function (e) { return { at:typeof e.at==='string' && e.at.length===10?capturedDay(e.at):captured(e.at),text:str(e.text,4000) }; }),provenance:provenance(d.source_file) };
    });
    function ranked(rows, make) { return list(rows,1000).map(function (r,index) { if (!Number.isSafeInteger(r.rank) || r.rank < 1) invalid(); return { rank:r.rank,index:index,row:make(r) }; }).sort(function(a,b){return a.rank-b.rank || a.index-b.index;}).map(function(e){return e.row;}); }
    var calls = ranked(source.calls,function(r){return {name:str(r.name,200),role:str(r.role,300),phone:str(r.phone,80,true),why:str(r.why,2000),questions:list(r.questions,3).map(function(q){return str(q,1000);}),deal:ref(r.deal),href:phoneLink(r.phone),provenance:provenance()};});
    var texts = list(source.texts,1000).map(function(r){unique(r.id); if (!['drafted','sent','replied'].includes(r.status)) invalid(); return {id:r.id,name:str(r.to_name,200),role:str(r.role,300),text:str(r.text,8000),status:r.status,deal:ref(r.deal),phone:str(r.phone,80,true),drafted_at:capturedDay(r.drafted_at),href:phoneLink(r.phone,r.text),device_key:receipt.file_sha256+':'+r.id,provenance:provenance()};});
    var emails = ranked(source.emails_waiting,function(r){return {who:str(r.who,200),role:str(r.role,300),subject:str(r.subject,500),deal:ref(r.deal),href:'/app?preview=1&view=email',provenance:provenance()};});
    var buyers = list(source.buyers,1000).map(function(r){unique(r.id); if (![true,false,null].includes(r.pof) || !['approved','pending','rejected',null].includes(r.approval)) invalid(); return {id:r.id,name:str(r.name,200),company:str(r.company,300,true),areas:list(r.areas,100).map(function(a){return str(a,200);}),buy_box:str(r.buy_box,4000,true),reported_pof:r.pof,reported_approval:r.approval,last_contact:capturedDay(r.last_contact,true),deals_sent:list(r.deals_sent,1000).map(function(value){if(value===null)invalid();return ref(value);}),phone:str(r.phone,80,true),email:str(r.email,320,true),source_url:safeURL(r.source_url),provenance:provenance()};});
    var needs = deals.filter(function(d){return d.needs_gabriel!==null;}).slice().sort(function(a,b){return Date.parse(b.updated_at)-Date.parse(a.updated_at);});
    return { receipt_id:receipt.id,file_sha256:receipt.file_sha256,generated_at:source.generated_at,imported_at:receipt.imported_at,filename:receipt.filename,
      needs_next:needs[0] || null,calls:calls,texts:texts.filter(function(r){return r.status==='drafted';}),emails:emails,
      stages:STAGES.map(function(stage){return {stage:stage,deals:deals.filter(function(d){return d.stage===stage;})};}),buyers:buyers,
      reported_approved_buyers:buyers.filter(function(b){return b.reported_approval==='approved';}).length,recent_replies:null };
  }
  return { project:project, phoneLink:phoneLink };
});
