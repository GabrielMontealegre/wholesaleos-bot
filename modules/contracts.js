// modules/contracts.js — AI-powered contract auto-fill
// Reads your wholesale template, fills all fields, suggests improvements

require('dotenv').config();
const { ask } = require('../ai');

const GABRIEL = {
  name:    'Gabriel Aníbal Enrique Montealegre Sandino',
  company: 'Montsan Real Estate Investment',
  address: '716 Savannah, Texas, 76227',
  email:   process.env.GMAIL_USER || 'montsan.rei@gmail.com',
  buyer_clause: 'Montsan Real Estate Investment and/or Assigns',
};

// State name mapping
const STATE_NAMES = {
  TX:'Texas', CA:'California', FL:'Florida', NY:'New York', AZ:'Arizona',
  CO:'Colorado', WA:'Washington', OR:'Oregon', NV:'Nevada', GA:'Georgia',
  IL:'Illinois', OH:'Ohio', PA:'Pennsylvania', NC:'North Carolina', VA:'Virginia',
};

function detectState(address) {
  const match = (address || '').match(/\b([A-Z]{2})\b/);
  const abbr = match ? match[1] : 'TX';
  return { abbr, name: STATE_NAMES[abbr] || abbr };
}

function calcEarnestMoney(offerPrice, category) {
  // Earnest money strategy based on deal type
  if (category?.includes('REO') || category?.includes('Bank')) return Math.min(2500, Math.round(offerPrice * 0.02));
  if (category?.includes('Pre-FC') || category?.includes('Foreclosure')) return Math.min(2500, Math.round(offerPrice * 0.02));
  return Math.min(5000, Math.round(offerPrice * 0.03));
}

function calcClosingDate(category, daysFromNow = 21) {
  const d = new Date();
  if (category?.includes('Pre-FC')) daysFromNow = 14; // Faster for foreclosures
  if (category?.includes('Probate')) daysFromNow = 45; // Slower for probate
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// Auto-fill contract fields from lead data
async function fillContract(lead, sellerName = '', titleCompany = '', extraNotes = '') {
  const state = detectState(lead.address);
  const emd   = calcEarnestMoney(lead.offer || 0, lead.category);
  const closeDate = calcClosingDate(lead.category);
  const today = new Date().toISOString().slice(0, 10);

  const fields = {
    effective_date:    today,
    seller_name:       sellerName || '[SELLER NAME — fill in]',
    buyer_name:        GABRIEL.buyer_clause,
    property_address:  lead.address || '[PROPERTY ADDRESS]',
    purchase_price:    `$${(lead.offer || 0).toLocaleString()}`,
    earnest_money:     `$${emd.toLocaleString()}`,
    title_company:     titleCompany || '[TITLE COMPANY — assign per deal]',
    earnest_days:      '3',
    inspection_days:   '10',
    closing_date:      closeDate,
    governing_state:   state.name,
    arbitration_state: state.name,
  };

  // AI review and suggestions
  const aiPrompt = `You are a real estate contract advisor for Gabriel Montealegre at Montsan Real Estate Investment.

Review this wholesale purchase contract fill-in and provide:
1. A summary of what was filled in
2. Any suggested improvements or changes to protect Gabriel as the buyer/wholesaler
3. Any clauses that should be strengthened based on the deal type: ${lead.category || 'motivated seller'}
4. Anything unusual about this deal that warrants special attention

Contract fields filled:
${JSON.stringify(fields, null, 2)}

Deal details:
- ARV: $${(lead.arv || 0).toLocaleString()}
- Offer: $${(lead.offer || 0).toLocaleString()}
- Repairs: $${(lead.repairs || 0).toLocaleString()}
- Risk: ${lead.risk || 'Medium'}
- DOM: ${lead.dom || 0} days
- County: ${lead.county || 'Unknown'}
${extraNotes ? '- Extra notes: ' + extraNotes : ''}

Be concise. Format as:
FILLED: [summary]
SUGGESTIONS: [numbered list]
WATCH OUT: [any concerns]`;

  let aiReview = '';
  try {
    aiReview = await ask(aiPrompt, '', 800);
  } catch {
    aiReview = 'AI review unavailable — verify all fields manually before sending.';
  }

  return { fields, aiReview, state, emd, closeDate };
}

// Generate contract text from template
function generateContractText(fields, lead) {
  return `REAL ESTATE PURCHASE AND SALE AGREEMENT

This Agreement ("Agreement") is entered into as of ${fields.effective_date} ("Effective Date") between ${fields.seller_name} ("Seller") and ${fields.buyer_name} ("Buyer").

1. PROPERTY
Seller agrees to sell and Buyer agrees to purchase the real property located at ${fields.property_address} (the "Property"), together with all improvements and fixtures.

2. PURCHASE PRICE
The total purchase price shall be ${fields.purchase_price}, payable in cash at Closing.

3. EARNEST MONEY
Buyer shall deposit ${fields.earnest_money} with ${fields.title_company} within ${fields.earnest_days} days of the Effective Date. Earnest Money shall be applied to the Purchase Price at Closing or refunded if this Agreement is terminated under the Inspection Period.

4. INSPECTION PERIOD
Buyer shall have ${fields.inspection_days} days from the Effective Date to inspect the Property. Buyer may terminate this Agreement during this period by written notice to Seller, and Earnest Money shall be refunded.

5. CLOSING
Closing shall occur on or before ${fields.closing_date} ("Closing Date"). At Closing, Seller shall deliver marketable title, free of all liens and encumbrances except as disclosed and accepted by Buyer, and Buyer shall deliver the balance of the Purchase Price. Closing costs shall be paid by Buyer.

6. AS-IS CONDITION
The Property is sold in its present, "as-is" condition, subject to Buyer's inspection rights.

7. ASSIGNMENT
Buyer may assign this Agreement without Seller's further consent or compensation. Buyer shall remain responsible for performance under this Agreement if the assignee fails to perform.

8. TIME IS OF THE ESSENCE
All dates and deadlines in this Agreement are material. Failure to timely perform is a breach.

9. DEFAULT & REMEDIES
If Seller defaults, Buyer may terminate with refund of Earnest Money, recover option costs, or seek specific performance or damages. If Buyer defaults, Seller may terminate and keep Earnest Money. Prevailing party is entitled to attorney's fees.

10. REPRESENTATIONS & WARRANTIES
Seller represents it owns the Property, has authority to sell, and title will be free of liens except as disclosed.

11. NOTICES
Notices must be in writing and deemed delivered when personally delivered, by courier, or by email with confirmation.

12. GOVERNING LAW & ARBITRATION
This Agreement is governed by the laws of the State of ${fields.governing_state}. Any disputes shall be resolved by binding arbitration in such state under AAA rules.

13. INTEGRATION & AMENDMENT
This Agreement is the entire agreement and may only be modified in writing signed by both parties.

14. SEVERABILITY
If any provision is invalid, the rest remain enforceable.

15. COUNTERPARTS
This Agreement may be signed in counterparts; electronic or copy signatures are binding.

16. CONFIDENTIALITY
This transaction and related information shall remain confidential except as required by law or to close the transaction.

17. BINDING EFFECT
This Agreement binds and benefits the parties and their heirs, successors, and permitted assigns.

SELLER:
Signature: ________________________________
Name: ${fields.seller_name}
Date: ____________________________________

BUYER:
Signature: ________________________________
Name: ${fields.buyer_name}
Date: ____________________________________

---
Generated by Montsan REI Deal System | ${new Date().toISOString().slice(0,10)}
Property: ${fields.property_address} | ARV: $${(lead.arv||0).toLocaleString()} | Offer: ${fields.purchase_price}`;
}

module.exports = { fillContract, generateContractText, GABRIEL, detectState };
