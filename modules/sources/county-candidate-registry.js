'use strict';

// Cycle 9 county onboarding hypotheses.
// These entries are deliberately framed as candidate sources, not facts.

const COUNTY_CANDIDATES = Object.freeze([
  {
    county: 'Franklin',
    state: 'OH',
    metro: 'Columbus',
    candidate_parcel_hosts: [
      'https://property.franklincountyauditor.com/',
      'https://auditor.franklincountyohio.gov/'
    ],
    candidate_sales_hosts: [
      'https://property.franklincountyauditor.com/'
    ],
    candidate_distress_sources: [
      'https://www.franklincountyohio.gov/',
      'https://court.franklincountyohio.gov/',
      'https://www.franklincountyohio.gov/Government/Departments/Treasurer'
    ],
    notes: 'Hypothesis: Franklin may have a free auditor layer or searchable records index with enough parcel context for taxpayer or owner routing.'
  },
  {
    county: 'Hamilton',
    state: 'OH',
    metro: 'Cincinnati',
    candidate_parcel_hosts: [
      'https://www.hamiltoncountyohio.gov/government/departments/auditor',
      'https://cagis.hamilton-co.org/'
    ],
    candidate_sales_hosts: [
      'https://cagis.hamilton-co.org/'
    ],
    candidate_distress_sources: [
      'https://www.hamiltoncountyohio.gov/government/departments/treasurer',
      'https://www.hamiltoncountyauditor.org/'
    ],
    notes: 'Hypothesis: Hamilton may expose parcel or appraisal search through a county GIS or auditor portal; foreclosure postings may ride a separate county index.'
  },
  {
    county: 'Cuyahoga',
    state: 'OH',
    metro: 'Cleveland',
    candidate_parcel_hosts: [
      'https://cuyahogacounty.gov/',
      'https://cuyahogacounty.gov/treasurer'
    ],
    candidate_sales_hosts: [
      'https://cuyahogacounty.gov/'
    ],
    candidate_distress_sources: [
      'https://cuyahogacounty.gov/treasurer',
      'https://cuyahogalandbank.org/'
    ],
    notes: 'Recheck monthly. Current verified outcome remains blocked by county network reachability from automated vantages.'
  },
  {
    county: 'Philadelphia',
    state: 'PA',
    metro: 'Philadelphia',
    candidate_parcel_hosts: [
      'https://property.phila.gov/',
      'https://atlas.phila.gov/'
    ],
    candidate_sales_hosts: [
      'https://property.phila.gov/'
    ],
    candidate_distress_sources: [
      'https://opendataphilly.org/',
      'https://www.phila.gov/departments/department-of-records/'
    ],
    notes: 'Hypothesis: Philadelphia may support open parcel and distress-data workflows through property and open-data portals.'
  },
  {
    county: 'Cook',
    state: 'IL',
    metro: 'Chicago',
    candidate_parcel_hosts: [
      'https://www.cookcountyassessor.com/',
      'https://datacatalog.cookcountyil.gov/'
    ],
    candidate_sales_hosts: [
      'https://datacatalog.cookcountyil.gov/'
    ],
    candidate_distress_sources: [
      'https://www.cookcountyclerkil.gov/',
      'https://www.cookcountysheriffil.gov/'
    ],
    notes: 'Hypothesis: Cook may expose assessor/search and public data catalog endpoints suitable for proof-only or mail-ready evidence.'
  },
  {
    county: 'Mecklenburg',
    state: 'NC',
    metro: 'Charlotte',
    candidate_parcel_hosts: [
      'https://polaris3g.mecklenburgcountync.gov/',
      'https://www.mecknc.gov/'
    ],
    candidate_sales_hosts: [
      'https://polaris3g.mecklenburgcountync.gov/'
    ],
    candidate_distress_sources: [
      'https://meckrod.manatron.com/',
      'https://www.mecknc.gov/TaxCollections'
    ],
    notes: 'Hypothesis: Mecklenburg may expose parcel detail through Polaris or related county record systems.'
  },
  {
    county: 'Marion',
    state: 'IN',
    metro: 'Indianapolis',
    candidate_parcel_hosts: [
      'https://maps.indy.gov/',
      'https://www.indy.gov/'
    ],
    candidate_sales_hosts: [
      'https://maps.indy.gov/'
    ],
    candidate_distress_sources: [
      'https://www.indy.gov/',
      'https://www.indy.gov/activity/code-enforcement'
    ],
    notes: 'Hypothesis: Marion may expose property and distress evidence through Indy maps or city/county open-data pages.'
  },
  {
    county: 'Duval',
    state: 'FL',
    metro: 'Jacksonville',
    candidate_parcel_hosts: [
      'https://paopropertysearch.coj.net/',
      'https://www.coj.net/departments/property-appraiser'
    ],
    candidate_sales_hosts: [
      'https://paopropertysearch.coj.net/'
    ],
    candidate_distress_sources: [
      'https://www.coj.net/departments/property-appraiser',
      'https://www.coj.net/departments/code-enforcement'
    ],
    notes: 'Hypothesis: Duval may provide free public parcel/search and city distress pages suitable for public-proof rows.'
  },
  {
    county: 'Hillsborough',
    state: 'FL',
    metro: 'Tampa',
    candidate_parcel_hosts: [
      'https://www.hcpafl.org/Property-Search',
      'https://www.hillsboroughcounty.org/'
    ],
    candidate_sales_hosts: [
      'https://www.hcpafl.org/Property-Search'
    ],
    candidate_distress_sources: [
      'https://www.hillsclerk.com/',
      'https://www.hillsboroughcounty.org/'
    ],
    notes: 'Hypothesis: Hillsborough may have an assessor search and clerk notices suitable for a free public lane.'
  },
  {
    county: 'Clark',
    state: 'NV',
    metro: 'Las Vegas',
    candidate_parcel_hosts: [
      'https://maps.clarkcountynv.gov/',
      'https://www.clarkcountynv.gov/'
    ],
    candidate_sales_hosts: [
      'https://maps.clarkcountynv.gov/'
    ],
    candidate_distress_sources: [
      'https://www.clarkcountynv.gov/',
      'https://www.clarkcountynv.gov/government/departments'
    ],
    notes: 'Hypothesis: Clark may expose GIS/assessor data and county notices through public map services.'
  },
  {
    county: 'Oakland',
    state: 'MI',
    metro: 'Detroit',
    candidate_parcel_hosts: [
      'https://www.oakgov.com/',
      'https://bsaonline.com/?uid=215'
    ],
    candidate_sales_hosts: [
      'https://www.oakgov.com/'
    ],
    candidate_distress_sources: [
      'https://www.oakgov.com/government/property-assessment',
      'https://www.oakgov.com/government/departments/community-development/land-banking'
    ],
    notes: 'Hypothesis: Oakland may expose parcel and land-bank evidence through county or BSAOnline-linked public pages.'
  },
  {
    county: 'Macomb',
    state: 'MI',
    metro: 'Detroit',
    candidate_parcel_hosts: [
      'https://www.macombgov.org/',
      'https://access.macombgov.org/'
    ],
    candidate_sales_hosts: [
      'https://access.macombgov.org/'
    ],
    candidate_distress_sources: [
      'https://www.macombgov.org/',
      'https://www.macombgov.org/tax-foreclosure'
    ],
    notes: 'Hypothesis: Macomb may have public parcel or tax-foreclosure material through county web properties.'
  },
  {
    county: 'Genesee',
    state: 'MI',
    metro: 'Flint',
    candidate_parcel_hosts: [
      'https://bsaonline.com/?uid=1487',
      'https://www.geneseecountymi.gov/'
    ],
    candidate_sales_hosts: [
      'https://bsaonline.com/?uid=1487'
    ],
    candidate_distress_sources: [
      'https://www.geneseecountymi.gov/',
      'https://www.geneseecountymi.gov/departments/treasurer.php'
    ],
    notes: 'Hypothesis: Genesee may expose property and distress evidence through a BSAOnline-backed county page or county treasury pages.'
  },
  {
    county: 'Maricopa',
    state: 'AZ',
    metro: 'Phoenix',
    candidate_parcel_hosts: [
      'https://mcassessor.maricopa.gov/',
      'https://www.maricopa.gov/'
    ],
    candidate_sales_hosts: [
      'https://mcassessor.maricopa.gov/'
    ],
    candidate_distress_sources: [
      'https://www.maricopa.gov/',
      'https://www.maricopa.gov/3525/Tax-Sale'
    ],
    notes: 'Hypothesis: Maricopa has longstanding assessor and tax-sale public data that may support a future free lane.'
  },
  {
    county: 'Harris',
    state: 'TX',
    metro: 'Houston',
    candidate_parcel_hosts: [
      'https://www.hcad.org/',
      'https://www.cclerk.hctx.net/applications/websearch/FRCL_R.aspx'
    ],
    candidate_sales_hosts: [
      'https://www.hcad.org/'
    ],
    candidate_distress_sources: [
      'https://www.cclerk.hctx.net/applications/websearch/FRCL_R.aspx',
      'https://www.harriscountytreasurer.com/'
    ],
    notes: 'Hypothesis: Harris has search-app foreclosure pages but no config-fit direct notice lane yet.'
  },
  {
    county: 'Tarrant',
    state: 'TX',
    metro: 'Fort Worth',
    candidate_parcel_hosts: [
      'https://www.tad.org/',
      'https://publicsearch.tarrantcountytx.gov/'
    ],
    candidate_sales_hosts: [
      'https://www.tad.org/'
    ],
    candidate_distress_sources: [
      'https://www.tarrantcountytx.gov/en/county-clerk/real-estate-records/foreclosures.html',
      'https://publicsearch.tarrantcountytx.gov/'
    ],
    notes: 'Hypothesis: Tarrant remains portal-heavy; retain as a future free-public survey candidate only.'
  },
  {
    county: 'Bexar',
    state: 'TX',
    metro: 'San Antonio',
    candidate_parcel_hosts: [
      'https://maps.bexar.org/foreclosures/',
      'https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures'
    ],
    candidate_sales_hosts: [
      'https://maps.bexar.org/foreclosures/'
    ],
    candidate_distress_sources: [
      'https://maps.bexar.org/foreclosures/',
      'https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures'
    ],
    notes: 'Verified open in Cycle 6 for the foreclosure lane; parcel owner lookup remains separately caveated.'
  }
]);

function countyKey(entry) {
  return [cleanText(entry && entry.county).toLowerCase(), cleanText(entry && entry.state).toUpperCase()].join('|');
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function countiesByState(state) {
  const target = cleanText(state).toUpperCase();
  return COUNTY_CANDIDATES.filter((entry) => cleanText(entry.state).toUpperCase() === target);
}

function countyByKey(county, state) {
  const key = countyKey({ county, state });
  return COUNTY_CANDIDATES.find((entry) => countyKey(entry) === key) || null;
}

function countyOnboardingTier(entry, probeEvidence) {
  const tier = cleanText(probeEvidence && probeEvidence.tier).toUpperCase();
  return ['FULL', 'MAIL_ONLY', 'PROOF_ONLY', 'BLOCKED'].includes(tier) ? tier : 'CANDIDATE';
}

function countyOnboardingStatus(entry, probeEvidence) {
  const status = cleanText(probeEvidence && probeEvidence.status).toLowerCase();
  return ['live', 'piloting', 'survey', 'blocked'].includes(status) ? status : 'candidate';
}

module.exports = {
  COUNTY_CANDIDATES,
  countyByKey,
  countiesByState,
  countyOnboardingTier,
  countyOnboardingStatus
};
