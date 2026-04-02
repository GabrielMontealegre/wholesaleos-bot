// contract_templates.js — Real wholesale contract templates
// IMPORTANT: These are templates only. Consult a licensed real estate attorney
// before using in any actual transaction.

const TEMPLATES = [
  {
    id: 'CT001',
    name: 'Wholesale Assignment Agreement',
    category: 'Assignment Contract',
    states: 'ALL',
    description: 'Standard agreement to assign your equitable interest in a purchase contract to an end buyer.',
    tags: ['assignment','wholesale','basic'],
    version: '1.0',
    content: `ASSIGNMENT OF CONTRACT

Date: [DATE]
Assignor: [YOUR NAME] ("Assignor")
Assignee: [BUYER NAME] ("Assignee")

RECITALS:
Assignor entered into a Purchase and Sale Agreement ("Purchase Contract") dated [CONTRACT DATE] with [SELLER NAME] ("Seller") for the property located at:
[PROPERTY ADDRESS] ("Property")

ASSIGNMENT:
For valuable consideration of $[ASSIGNMENT FEE], receipt acknowledged, Assignor assigns to Assignee all rights, title, and interest in the Purchase Contract.

TERMS:
1. Purchase Price: $[PURCHASE PRICE] (as stated in original contract)
2. Assignment Fee: $[ASSIGNMENT FEE] (due at closing)
3. Closing Date: [CLOSING DATE]
4. Earnest Money: $[EARNEST AMOUNT] (paid by Assignee)

REPRESENTATIONS:
Assignor represents the Purchase Contract is valid and in full force.
Assignee accepts the Purchase Contract in its current form.
Assignee assumes all obligations of Assignor under the Purchase Contract.

This agreement is binding upon both parties upon execution.

ASSIGNOR: _____________________  Date: ________
[YOUR NAME]

ASSIGNEE: _____________________  Date: ________
[BUYER NAME]

ATTORNEY NOTICE: This template is for educational purposes. Have a licensed real estate attorney review before use.`,
  },
  {
    id: 'CT002',
    name: 'Purchase and Sale Agreement (Wholesale)',
    category: 'Purchase Agreement',
    states: 'ALL',
    description: 'Wholesale-friendly purchase contract with assignability clause built in.',
    tags: ['purchase','wholesale','assignable'],
    version: '1.0',
    content: `REAL ESTATE PURCHASE AND SALE AGREEMENT

Date: [DATE]
Buyer: [YOUR NAME] and/or Assigns ("Buyer")
Seller: [SELLER NAME] ("Seller")
Property: [PROPERTY ADDRESS] ("Property")

1. PURCHASE PRICE: $[PURCHASE PRICE]
   Earnest Money: $[EARNEST AMOUNT] due within [X] days of execution
   Balance: Due at closing

2. CLOSING DATE: On or before [CLOSING DATE]

3. ASSIGNABILITY: Buyer reserves the right to assign this contract to any third party without Seller consent. Assignment does not release Buyer from obligations without written consent.

4. AS-IS CONDITION: Seller agrees to sell and Buyer agrees to purchase the Property in its current "as-is" condition. Buyer has conducted or waived all inspections.

5. CONTINGENCIES:
   [X] Inspection Period: [X] days from execution
   [X] Financing: Cash, no financing contingency
   [ ] Other: ________________________

6. TITLE: Seller to provide clear and marketable title via [TITLE COMPANY].

7. POSSESSION: Seller to deliver vacant possession at closing unless otherwise agreed.

8. DEFAULT: If Buyer defaults, earnest money is Seller's sole remedy. If Seller defaults, Buyer may seek specific performance or return of earnest money.

9. ENTIRE AGREEMENT: This agreement constitutes the entire agreement between parties.

SELLER: _____________________  Date: ________
[SELLER NAME]

BUYER: _____________________  Date: ________
[YOUR NAME] and/or Assigns

ATTORNEY NOTICE: State-specific contract forms may be required. Consult a licensed real estate attorney.`,
  },
  {
    id: 'CT003',
    name: 'Joint Venture Agreement',
    category: 'JV Agreement',
    states: 'ALL',
    description: 'Joint venture agreement for co-wholesaling or partnering on deals.',
    tags: ['jv','partnership','co-wholesale'],
    version: '1.0',
    content: `JOINT VENTURE AGREEMENT

Date: [DATE]
Party A: [YOUR NAME] ("Deal Finder")
Party B: [PARTNER NAME] ("Co-Venturer")
Property: [PROPERTY ADDRESS] ("Property")

PURPOSE:
The parties agree to jointly pursue the wholesale of the Property.

ROLES AND RESPONSIBILITIES:
Deal Finder:
- Identified and secured the property under contract
- Manages seller relationship
- Coordinates closing

Co-Venturer:
- [DESCRIBE PARTNER CONTRIBUTION: e.g., brought buyer / provided capital / managed marketing]

PROFIT SPLIT:
Total Assignment Fee: $[TOTAL FEE]
Deal Finder receives: [X]% = $[AMOUNT]
Co-Venturer receives: [X]% = $[AMOUNT]

PAYMENT: Fees distributed at closing from title company.

EXPENSES: Each party bears own expenses unless otherwise agreed in writing.

DISPUTES: Parties agree to mediation before litigation.

TERM: This JV is for this specific transaction only.

PARTY A: _____________________  Date: ________
[YOUR NAME]

PARTY B: _____________________  Date: ________
[PARTNER NAME]`,
  },
  {
    id: 'CT004',
    name: 'Cash Buyer Agreement',
    category: 'Buyer Agreement',
    states: 'ALL',
    description: 'Agreement establishing terms with a repeat cash buyer for deal flow.',
    tags: ['buyer','cash','agreement'],
    version: '1.0',
    content: `CASH BUYER AGREEMENT

Date: [DATE]
Wholesaler: [YOUR NAME] / Montsan Real Estate Investment
Buyer: [BUYER NAME / COMPANY] ("Buyer")

AGREEMENT:
Wholesaler agrees to present Buyer with wholesale real estate opportunities meeting Buyer's buy box criteria.

BUYER'S BUY BOX:
Market(s): [COUNTIES/STATES]
Property Types: [SFR / MFR / Commercial]
Price Range: $[MIN] – $[MAX]
Rehab Level: [Light / Medium / Heavy]
Minimum ARV: $[AMOUNT]
Strategies: [Flip / Hold / BRRRR]

TERMS:
1. Wholesaler will present deals matching the above criteria.
2. Buyer will respond within [48] hours of receiving deal package.
3. Assignment fee will be disclosed with each deal presentation.
4. Buyer agrees to keep deal information confidential.
5. This agreement does not guarantee Buyer will purchase any presented deal.
6. Either party may terminate with 7 days written notice.

EARNEST MONEY: Buyer agrees to provide $[AMOUNT] non-refundable earnest money within [X] hours of accepting a deal.

BUYER: _____________________  Date: ________
[BUYER NAME]

WHOLESALER: _____________________  Date: ________
[YOUR NAME]`,
  },
  {
    id: 'CT005',
    name: 'Seller Representation Agreement',
    category: 'Seller Agreement',
    states: 'ALL',
    description: 'Establishes your relationship with a motivated seller before writing a purchase contract.',
    tags: ['seller','representation','motivated'],
    version: '1.0',
    content: `SELLER REPRESENTATION AGREEMENT

Date: [DATE]
Seller: [SELLER NAME] ("Seller")
Investor: Gabriel Montealegre / Montsan Real Estate Investment ("Investor")
Property: [PROPERTY ADDRESS] ("Property")

INVESTOR ROLE: Investor is a private real estate investor, NOT a licensed real estate agent.

PURPOSE: Seller grants Investor the right to market and find a buyer for the Property.

TERMS:
1. EXCLUSIVITY: [X] Exclusive [ ] Non-exclusive for [X] days from date above.
2. LISTING PRICE: $[AMOUNT] or best offer acceptable to Seller.
3. INVESTOR FEE: Investor will earn an assignment fee paid by buyer at closing. Seller pays nothing.
4. SELLER OBLIGATIONS: Seller will cooperate with showings and provide accurate property information.
5. AS-IS: Property to be sold in current condition.
6. TIMELINE: Target close by [DATE].

SELLER DISCLOSURE:
Seller discloses all known material defects: [SELLER TO LIST]

SELLER: _____________________  Date: ________
[SELLER NAME]

INVESTOR: _____________________  Date: ________
Gabriel Montealegre`,
  },
  {
    id: 'CT006',
    name: 'Option to Purchase Agreement',
    category: 'Option Contract',
    states: 'ALL',
    description: 'Gives you the option (not obligation) to purchase property within a set timeframe.',
    tags: ['option','creative','control'],
    version: '1.0',
    content: `OPTION TO PURCHASE AGREEMENT

Date: [DATE]
Optionor (Seller): [SELLER NAME]
Optionee (Buyer): [YOUR NAME] and/or Assigns
Property: [PROPERTY ADDRESS]

OPTION GRANT:
For Option Consideration of $[OPTION FEE] (non-refundable unless stated below), Optionor grants Optionee the exclusive right to purchase the Property.

OPTION PERIOD: From [START DATE] to [END DATE] ("Option Period")

PURCHASE PRICE: $[PURCHASE PRICE] if option is exercised.

EXERCISE: Optionee may exercise this option by delivering written notice to Optionor before expiration.

ASSIGNABILITY: Optionee may assign this option without Optionor consent.

EXPIRATION: If not exercised before [END DATE], this option expires and Option Consideration is retained by Optionor.

CLOSING: If exercised, closing to occur within [X] days of exercise notice.

OPTIONOR: _____________________  Date: ________
[SELLER NAME]

OPTIONEE: _____________________  Date: ________
[YOUR NAME]`,
  },
  {
    id: 'CT007',
    name: 'Double Close Authorization',
    category: 'Double Close Agreement',
    states: 'ALL',
    description: 'Authorization for simultaneous or back-to-back closing using transactional funding.',
    tags: ['double close','AB','BC','transactional'],
    version: '1.0',
    content: `DOUBLE CLOSE AUTHORIZATION AND DISCLOSURE

Date: [DATE]
Property: [PROPERTY ADDRESS]

DISCLOSURE:
This transaction involves a double (simultaneous) closing. Two separate transactions will occur:

Transaction A-B:
Seller: [ORIGINAL SELLER]
Buyer: [YOUR NAME] ("Investor")
Price: $[A-B PRICE]
Close Date: [DATE]

Transaction B-C:
Seller: [YOUR NAME] ("Investor")
Buyer: [END BUYER]
Price: $[B-C PRICE]
Close Date: [SAME DAY OR NEXT DAY]

FUNDING: Transaction A-B will be funded via [transactional funding / own funds / other].
Proceeds from B-C transaction will fund A-B transaction [if same day].

ALL PARTIES ACKNOWLEDGE:
- Investor's profit is the spread between A-B and B-C prices
- All transactions are disclosed to the title company
- Each party has had the opportunity to seek independent counsel

TITLE COMPANY: [TITLE COMPANY NAME] is handling both closings.

INVESTOR: _____________________  Date: ________
[YOUR NAME]

NOTE: Double close laws vary by state. Consult a licensed real estate attorney.`,
  },
  {
    id: 'CT008',
    name: 'Disclosure and Disclaimer Form',
    category: 'Disclosure Forms',
    states: 'ALL',
    description: 'Investor disclosure form to provide to sellers explaining your role and process.',
    tags: ['disclosure','transparency','seller'],
    version: '1.0',
    content: `REAL ESTATE INVESTOR DISCLOSURE STATEMENT

Date: [DATE]
Investor: Gabriel Montealegre / Montsan Real Estate Investment
Seller: [SELLER NAME]
Property: [PROPERTY ADDRESS]

IMPORTANT DISCLOSURES — PLEASE READ CAREFULLY

1. I AM NOT A LICENSED REAL ESTATE AGENT OR BROKER.
   I am a private real estate investor purchasing properties for investment purposes.

2. I AM BUYING FOR PROFIT.
   I intend to resell or assign my interest in this property for a profit.
   I may earn an assignment fee from a third-party buyer.

3. MY OFFER MAY BE BELOW MARKET VALUE.
   Cash offers for as-is properties are typically below retail market value.
   You have the right to consult a licensed real estate agent to compare options.

4. YOU HAVE THE RIGHT TO WALK AWAY.
   You are not obligated to accept any offer. Take time to consider your options.

5. YOU HAVE THE RIGHT TO CONSULT AN ATTORNEY.
   Before signing any contract, you may consult a licensed real estate attorney.

6. AS-IS PURCHASE.
   I am purchasing the property in its current condition. No repairs are required from you.

7. CLOSING COSTS.
   I will pay all customary closing costs. You will not pay real estate commissions.

By signing below, Seller acknowledges receiving and reading this disclosure.

SELLER: _____________________  Date: ________
[SELLER NAME]

INVESTOR: _____________________  Date: ________
Gabriel Montealegre`,
  },
];

function getTemplates() { return TEMPLATES; }
function getTemplate(id) { return TEMPLATES.find(t => t.id === id); }
function getTemplatesByCategory(cat) { return TEMPLATES.filter(t => t.category === cat); }

module.exports = { TEMPLATES, getTemplates, getTemplate, getTemplatesByCategory };
