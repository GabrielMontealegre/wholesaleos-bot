'use strict';
const assert=require('node:assert/strict');
const model=require('../dashboard/workspace/today-model');
const today='2026-10-21';
assert.equal(model.validDay(today),true);
for(const value of ['2026-02-30','2026-1-01','',null,1])assert.equal(model.validDay(value),false);
const actions=[
 {kind:'conversation',due_date:'2026-10-20',urgency:'upcoming'},
 {kind:'conversation',due_date:today,urgency:'waiting'},
 {kind:'buyer',urgency:'review'},
 {kind:'conversation',label:'Waiting on someone else',urgency:'waiting'},
 {kind:'deal',urgency:'upcoming'},
 null,
 {kind:'conversation',due_date:'bad',urgency:'forged'}
];
const groups=model.groupActions(actions,today);
assert.deepEqual(groups.overdue.map(x=>x.index),[0]);
assert.deepEqual(groups.due_today.map(x=>x.index),[1]);
assert.deepEqual(groups.review.map(x=>x.index),[2]);
assert.deepEqual(groups.waiting.map(x=>x.index),[3]);
assert.deepEqual(groups.upcoming.map(x=>x.index),[4,6]);
const invalidToday=model.groupActions(actions,'invalid');
assert.deepEqual(invalidToday.upcoming.map(x=>x.index),[0,1,4,6]);
assert.deepEqual(invalidToday.waiting.map(x=>x.index),[3]);
const recordedReplies = [
 {kind:'conversation',label:'Reply waiting',urgency:'upcoming'},
 {kind:'conversation',label:'Draft needs review'},
 {kind:'conversation',label:'Reply waiting',due_date:'2026-10-20'},
 {kind:'conversation',label:'Draft needs review',due_date:today},
 {kind:'conversation',label:'Unknown status',urgency:'review'}
];
const replyGroups=model.groupActions(recordedReplies,today);
assert.deepEqual(replyGroups.review.map(x=>x.index),[0,1]);
assert.deepEqual(replyGroups.overdue.map(x=>x.index),[2]);
assert.deepEqual(replyGroups.due_today.map(x=>x.index),[3]);
assert.deepEqual(replyGroups.upcoming.map(x=>x.index),[4]);
console.log('Today model: strict dates, canonical urgency precedence, malformed-data fallback and stable original-row indexes passed.');
