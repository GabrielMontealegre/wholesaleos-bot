'use strict';

// Informational rules. Only a verified sale-day rule is eligible to resolve a date.
const RULES = Object.freeze({
  TX: Object.freeze({
    disclosure: Object.freeze({ status: 'non_disclosure', citation: 'https://www.texasrealestate.com/news/the-difference-between-non-disclosure-and-confidential', verification_status: 'verified' }),
    foreclosure: Object.freeze({ type: 'nonjudicial_trustee_sale', sale_day: Object.freeze({ source_kind: 'trustee_sale_notice', calculation: 'first_tuesday_with_holiday_exception', rule_id: 'tx_prop_code_51_002_sale_day', citation: 'https://statutes.capitol.texas.gov/Docs/PR/pdf/PR.51.pdf', verification_status: 'verified' }) }),
    post_sale: Object.freeze({
      mortgage_trustee: Object.freeze({ redemption: 'none', verification_status: 'unverified', citation: 'https://statutes.capitol.texas.gov/Docs/PR/pdf/PR.51.pdf', note: 'Confirm the specific sale and any applicable exception before relying on this.' }),
      tax: Object.freeze({ homestead_or_agricultural: 'two_years', other: '180_days', basis: 'purchaser_deed_recording', citation: 'https://statutes.capitol.texas.gov/Docs/TX/pdf/TX.34.pdf', verification_status: 'verified' }),
      hoa: Object.freeze({ period: '180_days', basis: 'association_notice_mailed', citation: 'https://statutes.capitol.texas.gov/Docs/PR/pdf/PR.209.pdf', verification_status: 'verified', note: 'May apply; do not compute without the notice mailing date.' })
    }),
    business_search_url: 'https://www.sos.state.tx.us/corp/searches.shtml'
  }),
  NC: Object.freeze({
    disclosure: Object.freeze({ status: 'disclosure', citation: 'https://www.ncdor.gov/', verification_status: 'unverified' }),
    foreclosure: Object.freeze({ type: 'power_of_sale', sale_day: null }),
    post_sale: Object.freeze({ upset_bid: Object.freeze({ period: '10_days', basis: 'report_of_sale_or_last_upset_bid', citation: 'https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_45/GS_45-21.27.html', verification_status: 'verified', note: 'Court closures can extend the deadline; this is not a redemption period.' }) }),
    business_search_url: 'https://www.sosnc.gov/online_services/search/Business_Registration_Results'
  }),
  MI: Object.freeze({
    disclosure: Object.freeze({ status: 'disclosure', citation: 'https://www.michigan.gov/treasury/reference/tech/srett-exemption-on-transfer-of-interests-in-real-property', verification_status: 'unverified' }),
    foreclosure: Object.freeze({ type: 'foreclosure_by_advertisement', sale_day: null }),
    post_sale: Object.freeze({ mortgage: Object.freeze({ period: 'often_six_months', citation: 'https://www.legislature.mi.gov/documents/mcl/pdf/mcl-236-1961-32.pdf', verification_status: 'unverified', note: 'Actual period varies; verify recorded deed, occupancy and legal exceptions.' }) }),
    business_search_url: 'https://www.michigan.gov/corpentitysearch'
  })
});

function rulesForState(state) {
  return RULES[String(state || '').trim().toUpperCase()] || null;
}

module.exports = { RULES, rulesForState };
