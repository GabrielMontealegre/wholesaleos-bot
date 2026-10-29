'use strict';
const deals=require('../../modules/deals/reviewed-deals');
const {fixture,now}=require('../reviewed-deals.test');
function build(){
 const store=deals.ingest({buyers:[],leads:[]},[deals.validate(fixture(),now)],{now,operatorId:'fixture-admin',createId:()=> 'fixture-deal'}).store;
 return deals.list(store,{now,hidden:true});
}
module.exports={build};
