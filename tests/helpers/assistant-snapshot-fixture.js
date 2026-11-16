'use strict';
function fixture() {
  return { schema:'wos-assistant-snapshot',version:1,generated_at:'2026-10-26T13:00:00Z',
    deals:[{id:'demo-deal',name:'Synthetic property',stage:'finding_buyer',people:[{name:'Synthetic person',role:'buyer',phone:null,email:null}],
      numbers:{ask:0,seller_number:null,our_offer:null,target:null,value_fixed:null,repairs:null,buyer_number:{amount:null,buyer:null},fee_estimate_low:0,fee_estimate_high:0},
      next_seller:null,next_buyer:'Ask a question.',needs_gabriel:'Review the reported offer.',updated_at:'2026-10-26T12:00:00Z',log:[{at:'2026-10-25',text:'Reported event.'}],source_file:'deal-brains/demo.md'}],
    buyers:[{id:'demo-buyer',name:'Synthetic buyer',company:null,areas:['Example Area'],buy_box:null,pof:null,approval:'approved',last_contact:'2026-10-25',deals_sent:['demo-deal'],phone:null,email:null,source_url:null}],
    calls:[{name:'Synthetic person',role:'seller',phone:'+1 (555) 123-4567',why:'Confirm status.',questions:['What changed?'],deal:'demo-deal',rank:2}],
    texts:[{id:'demo-text',to_name:'Synthetic person',role:'seller',phone:'+15551234567',text:'Question & <script>not markup</script>',deal:'demo-deal',status:'drafted',drafted_at:'2026-10-25'}],
    emails_waiting:[{who:'Synthetic person',role:'buyer',subject:'Reported subject',deal:'demo-deal',draft_ref:'opaque-draft-ref',rank:1}] };
}
module.exports={fixture};
