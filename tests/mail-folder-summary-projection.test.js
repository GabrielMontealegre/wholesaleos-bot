'use strict';
const assert=require('node:assert/strict');
const {folderSummary}=require('../dashboard/workspace/mail-layout-model');
const scope={folder:'inbox',origin:'imap_status',scope_id:'INBOX',uid_validity:'7'};
const value={...scope,source_kind:'connected_mailbox',scope:'messages',captured_at:'2026-10-25T23:00:10Z',total_messages:200,unread_messages:12};
const options={folder:'inbox',startedAt:'2026-10-25T23:00:00Z',now:'2026-10-25T23:00:20Z'};
assert.equal(folderSummary(value,scope,options).total_messages,200);
assert.equal(folderSummary({...value,total_messages:0,unread_messages:0},scope,options).total_messages,0);
assert.equal(folderSummary({...value,unread_messages:null},scope,options).unread_messages,null);
for(const patch of [{folder:'sent'},{origin:'gmail_label_counts'},{scope_id:'Other'},{uid_validity:'8'},
  {source_kind:'derived_workflow'},{scope:'threads'},{total_messages:'200'},{total_messages:-1},{total_messages:Infinity},
  {unread_messages:201},{unread_messages:'12'},{unread_messages:-1},{captured_at:'2026-02-30T23:00:10Z'},
  {captured_at:'2026-10-25T22:59:59Z'},{captured_at:'2026-10-25T23:00:21Z'}])assert.equal(folderSummary({...value,...patch},scope,options),null);
assert.equal(folderSummary(value,scope,{...options,now:'2026-10-25T23:01:10Z'}),null);
assert.equal(folderSummary(Object.create(value),scope,options),null);
assert.equal(folderSummary(value,Object.create(scope),options),null);
assert.equal(folderSummary(Object.assign([],value),scope,options),null);
for(const id of ['','Other\n','Other\t'])assert.equal(folderSummary({...value,scope_id:id},{...scope,scope_id:id},options),null);
const gmail={...scope,origin:'gmail_label_counts',scope_id:'Label_7',uid_validity:null};
assert.equal(folderSummary({...value,...gmail},gmail,options).unread_messages,12);
assert.equal(folderSummary({...value,...gmail,uid_validity:'7'},gmail,options),null);
console.log('mail-folder-summary-projection: provider scope/UID/folder/time/message-count validation,real zero,unknown unread and stale/forged/malformed negatives passed');
