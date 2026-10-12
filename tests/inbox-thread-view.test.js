'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {annotate}=require('../modules/email/thread-view');
const conversations=require('../modules/records/conversations');
const now='2026-10-12T12:00:00Z';
const row={id:'fixture-conversation',person:'DO NOT LEAK RECORD OWNER',role:'buyer',refs:['WOS-FL-1031'],channels:['email'],source_kind:'operator_input',recorded_at:'2026-10-10T12:00:00Z',email_message_ids:['<first@example.test>']};
const store={conversations:[row],reviewed_deals:[{id:'fixture-deal',record_ref:'WOS-FL-1031',address:'PRIVATE ADDRESS NOT IN EMAIL'}]};
const messages=[{id:'a',source_kind:'connected_mailbox',message_id:'<first@example.test>',date:'2026-10-10T12:00:00Z',direction:'in',from:'Sender',subject:'Topic'}, {id:'b',source_kind:'connected_mailbox',message_id:'<second@example.test>',in_reply_to:'<first@example.test>',date:'2026-10-11T12:00:00Z',direction:'out',from:'Owner',subject:'Reply'}, {id:'c',source_kind:'connected_mailbox',message_id:'<third@example.test>',in_reply_to:'<second@example.test>',date:'2026-10-12T10:00:00Z',direction:'in'}];
function run(){
 const frozen=JSON.stringify([store,messages]),oldFetch=global.fetch,oldNow=Date.now,oldWrite=fs.writeFileSync;
 global.fetch=()=>{throw Error('no network')};Date.now=()=>{throw Error('inject clock')};fs.writeFileSync=()=>{throw Error('no write')};
 try{
  const result=annotate(messages,store,{now});assert.equal(new Set(result.map(m=>m.thread_key)).size,1);assert.ok(result.every(m=>m.conversation.role==='buyer'));
  assert.deepEqual(result[0].conversation.deals,[{ref:'WOS-FL-1031',id:'fixture-deal'}]);assert.ok(!JSON.stringify(result).includes(row.person));assert.ok(!JSON.stringify(result).includes(store.reviewed_deals[0].address));
  assert.equal(JSON.stringify([store,messages]),frozen);assert.equal(result[1].direction,'out','role display never fabricates an incoming receipt');
  const ambiguous=annotate(messages,{...store,conversations:[row,{...row,id:'other',role:'seller'}]},{now});assert.ok(ambiguous.every(m=>m.conversation===null&&m.link_status==='ambiguous'));
  const unknown=annotate([{...messages[0],id:'guess',message_id:'',from:'Buyer investor',subject:'WOS-FL-1031'}],store,{now})[0];assert.equal(unknown.conversation,null);
  for(const patch of [{source_kind:'ai_guess'},{date:'2027-01-01T00:00:00Z'},{date:'2026-02-30T00:00:00Z'}])assert.equal(annotate([{...messages[0],...patch}],store,{now})[0].conversation,null);
  for(const patch of [{source_kind:'ai_guess'},{recorded_at:'2027-01-01T00:00:00Z'},{role:'__proto__'},{role:'not_recorded'},{channels:['manual']}])assert.equal(annotate(messages,{...store,conversations:[{...row,...patch}]},{now})[0].conversation,null);
  const independent=annotate([{...messages[0],id:'one',message_id:''},{...messages[0],id:'two',message_id:''}],store,{now});assert.notEqual(independent[0].thread_key,independent[1].thread_key,'same sender/subject is not thread proof');
  const thread=annotate([{...messages[0],message_id:'',threadId:'123456789abcdef0'}],{...store,conversations:[{...row,email_message_ids:[],thread_url:'https://mail.google.com/mail/u/0/#inbox/123456789abcdef0'}]},{now});assert.equal(thread[0].conversation.role,'buyer');
  assert.equal(annotate(messages,{...store,reviewed_deals:[...store.reviewed_deals,...store.reviewed_deals]},{now})[0].conversation.deals.length,0,'ambiguous ref never chooses a record');
  assert.equal(annotate(messages,{...store,conversations:[{...row,refs:['not-a-reference']}]},{now})[0].conversation.deals.length,0,'bad old ref is omitted, not followed or allowed to break the inbox');
  for(const role of conversations.ROLES){const input={kind:'conversation',person:'Fixture',role,refs:[],channels:['email'],status:'follow_up',captured_at:now};assert.equal(conversations.validate(input,now).role,role);}
  assert.throws(()=>conversations.validate({kind:'conversation',person:'Fixture',role:'ai_guess',channels:['email'],status:'follow_up',captured_at:now},now));
  console.log('Inbox view: exact headers/thread grouping, incoming/outgoing roles without direction mutation, explicit taxonomy, ambiguity/forged/future/missing rejection, no record-body leak, refs, purity passed.');
 }finally{global.fetch=oldFetch;Date.now=oldNow;fs.writeFileSync=oldWrite;}
}
if(require.main===module)run();module.exports={run,messages,store,now};
