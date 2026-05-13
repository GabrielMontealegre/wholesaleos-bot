'use strict';

var evidenceFusion = require('./evidence-fusion');

var courthousePdfSignal = {
  source_id: 'shelby-foreclosure-pdf',
  source_kind: 'pdf',
  source_type: 'Foreclosure',
  source_url: 'https://county.example/foreclosures',
  source_pdf_url: 'https://county.example/notices/notice-001.pdf',
  evidence_type: 'foreclosure',
  evidence_label: 'Foreclosure auction notice',
  confidence: 'high',
  timestamps: {
    observed_at: '2026-05-13',
    collected_at: '2026-05-13'
  },
  auction_date: '2026-06-15',
  foreclosure_stage: 'auction_scheduled',
  lien_amount: '$8,100',
  raw_reference: {
    case_number: 'CH-2026-001',
    page: 3
  }
};

var craigslistFixerSignal = {
  source_id: 'craigslist-fixer-example',
  source_kind: 'html',
  source_type: 'Fixer Listing',
  source_url: 'https://craigslist.example/post/123',
  evidence_type: 'vacant',
  evidence_label: 'Owner describes property as vacant fixer',
  confidence: 'medium',
  timestamps: {
    observed_at: '2026-05-12'
  },
  raw_reference: {
    post_id: '123',
    phrase: 'vacant fixer needs full rehab'
  }
};

var codeViolationSignal = {
  source_id: 'city-code-violations',
  source_kind: 'socrata',
  source_type: 'Code Violation',
  source_record_url: 'https://data.example/resource/violations/789',
  evidence_type: 'code_violation',
  evidence_label: 'Unsafe structure complaint',
  confidence: 'high',
  timestamps: {
    observed_at: '2026-05-10',
    collected_at: '2026-05-13'
  },
  raw_reference: {
    record_key: 'CV-789',
    violation_type: 'Unsafe structure'
  }
};

function runSample() {
  var fused = evidenceFusion.mergeLeadEvidence(null, courthousePdfSignal);
  fused = evidenceFusion.mergeLeadEvidence(fused, craigslistFixerSignal);
  fused = evidenceFusion.mergeLeadEvidence(fused, codeViolationSignal);
  return fused;
}

if (require.main === module) {
  console.log(JSON.stringify(runSample(), null, 2));
}

module.exports = {
  courthousePdfSignal: courthousePdfSignal,
  craigslistFixerSignal: craigslistFixerSignal,
  codeViolationSignal: codeViolationSignal,
  runSample: runSample
};
