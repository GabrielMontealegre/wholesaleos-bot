'use strict';

function range(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.low === 'number' && typeof value.high === 'number' &&
    Number.isFinite(value.low) && Number.isFinite(value.high) &&
    value.low >= 0 && value.high >= value.low && value.high <= 1e9 ? {low:value.low,high:value.high} : null;
}
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;
function calculate(input = {}, policies = {}) {
  const buyer = range(input.buyer_price), contract = range(input.contract_price);
  const explicit = range(input.costs), policy = policies[input.state]?.[input.path];
  const estimate = policy && typeof policy.label === 'string' && policy.label.trim() ? range(policy.range) : null;
  const costs = explicit || estimate;
  const missing = [!buyer && 'buyer_price', !contract && 'contract_price', !costs && 'costs'].filter(Boolean);
  const net = missing.length ? null : {low:cents(buyer.low-contract.high-costs.high),high:cents(buyer.high-contract.low-costs.low)};
  const share = typeof input.our_share === 'number' && input.our_share > 0 && input.our_share <= 1 ? input.our_share : null;
  return {source_kind:'derived_workflow',label:'Potential, no confirmed buyer',path:['assignment','double_close'].includes(input.path)?input.path:'unknown',
    buyer_price:buyer,contract_price:contract,costs,costs_basis:explicit?'reported_total':estimate?'configured_estimate':'not_recorded',
    estimate_label:!explicit&&estimate?policy.label.trim():null,net_fee:net,our_share:share,
    our_net:net&&share!==null?{low:cents(net.low*share),high:cents(net.high*share)}:null,missing};
}
module.exports={calculate,range};
