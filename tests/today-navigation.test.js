'use strict';
const assert=require('node:assert/strict');
const {buildTodayWorkspace}=require('../modules/agents/today-workspace');
const {groupActions,markup}=require('../dashboard/wos-today-workspace');
const conversationCards=require('../dashboard/wos-conversation-cards');
const now='2026-10-15T12:00:00Z';
const rows=[{key:'old',due_date:'2026-10-14'},{key:'today',due_date:'2026-10-15'},{key:'later',due_date:'2026-10-16'},{key:'missing'},{key:'bad',due_date:'2026-02-30'}];
const frozen=JSON.stringify(rows);
const groups=groupActions(rows,'2026-10-15');
assert.deepEqual(groups.overdue.map(r=>r.key),['old']);assert.equal(groups.current.length,4);
assert.equal(JSON.stringify(rows),frozen);assert.equal(groupActions(rows,'bad').overdue.length,0);
const store={buyers:[{id:'buyer',record_ref:'BUY-0001',assistant_find:{approval:'approved'}}],reviewed_deals:[],leads:[{id:'lead',record_ref:'WOS-TX-1040'}],activities:[
  {id:'a',ts:now,type:'found',buyer_ref:'BUY-0001'},
  {id:'b',ts:now,type:'found',deal_ref:'WOS-TX-1040'},
  {id:'c',ts:now,type:'found',deal_ref:'WOS-TX-1041'}]};
const before=JSON.stringify(store),view=buildTodayWorkspace(store,{now});
assert.deepEqual(view.last_24h.find(e=>e.ref==='BUY-0001').target,{kind:'buyer',id:'buyer',assistant_find:true});
assert.deepEqual(view.last_24h.find(e=>e.ref==='WOS-TX-1040').target,{kind:'lead',id:'lead'});
assert.ok(!view.last_24h.find(e=>e.ref==='WOS-TX-1041').target,'No prefix-based inferred target');
const ambiguous=buildTodayWorkspace({...store,buyers:[...store.buyers,{id:'other',record_ref:'BUY-0001'}]},{now});
assert.ok(!ambiguous.last_24h.find(e=>e.ref==='BUY-0001').target);
assert.equal(JSON.stringify(store),before);
const html=markup({...view,actions:[{key:'old',due_date:'2026-10-14',label:'<script>bad</script>',action_label:'Open conversation'}]});
assert.ok(html.includes('today-overdue'));assert.ok(html.includes('Overdue (<span data-today-overdue-count>1'));
assert.ok(!html.includes('today-overdue" open'));assert.ok(!html.includes('<script>bad</script>'));
assert.ok(html.includes('data-today-record="activity:a"'));assert.ok(!html.includes('?record_ref='));
assert.ok(markup({...view,actions:[]}).includes('No recorded work needs your action today.'));
assert.ok(!conversationCards.render({refs:[]},{openRecorded:true}).includes('data-conversation-open'),'Missing ID never gets a dead opener');
console.log('Today navigation: unique typed targets, missing/ambiguous references do not guess, overdue boundary/invalid date/purity/escaping, honest empty queue passed.');
