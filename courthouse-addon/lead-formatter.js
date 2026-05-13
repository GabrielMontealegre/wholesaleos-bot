/**
 * LeadFormatter — converts parsed courthouse records into WholesaleOS lead objects
 * Adds wholesaling signal flags without touching existing bot format
 */

'use strict';

const { v4: uuid } = require('uuid');
const { normalizeSourcePayload } = require('../modules/sources/transforms/source-normalizer');

// Days from now that qualifies as "expiring soon"
const EXPIRING_DAYS = 14;

function marketCity(src) {
  var market = src && src.market ? String(src.market) : '';
  return market.split(',')[0].trim();
}

function sourceKindForCourthouse(raw, src) {
  var text = [
    raw && raw.source_kind,
    raw && raw.source,
    raw && raw.source_type,
    src && src.type,
    raw && raw.pdf_source_url,
    raw && raw.source_pdf_url,
    raw && raw.pdf_path,
    src && src.url
  ].filter(Boolean).join(' ').toLowerCase();
  if (text.indexOf('pdf') > -1 || /\.pdf(\?|$)/.test(text)) return 'pdf';
  if (text.indexOf('csv') > -1) return 'csv';
  if (text.indexOf('excel') > -1 || text.indexOf('xlsx') > -1 || text.indexOf('xls') > -1) return 'csv';
  return 'courthouse';
}

function normalizeCourthousePdfPayload(raw, src) {
  raw = raw || {};
  src = src || {};
  var sourceUrl = raw.source_url || raw.url || src.source_url || src.url || null;
  var sourcePdfUrl = raw.source_pdf_url || raw.pdf_source_url || raw.pdf_url || src.source_pdf_url || src.pdf_url || null;
  if (!sourcePdfUrl && sourceUrl && /\.pdf(\?|$)/i.test(sourceUrl)) sourcePdfUrl = sourceUrl;
  var sourceConfidence = raw.source_confidence || raw.pdf_confidence || (raw.needs_ocr ? 'scanned_image' : null);

  return normalizeSourcePayload(Object.assign({}, raw, {
    city: raw.city || marketCity(src),
    state: raw.state || src.state,
    county: raw.county || src.county || src.market,
    source: raw.source || 'courthouse',
    source_type: raw.source_type || raw.doc_type || src.type || 'Courthouse Record',
    source_url: sourceUrl,
    source_pdf_url: sourcePdfUrl,
    source_record_url: raw.source_record_url || raw.record_url || raw.case_url || null,
    source_confidence: sourceConfidence,
    source_details: raw.source_details || {
      type: raw.source_type || raw.doc_type || src.type || 'Courthouse Record',
      source_name: src.market || raw.county || 'Courthouse'
    },
    auction_date: raw.auction_date || raw.date || raw.sale_date || null,
    years_delinquent: raw.years_delinquent || raw.tax_years || null,
    evidence_snippets: raw.evidence_snippets || raw.snippets || raw.raw_line || raw.pdf_text || null
  }), {
    source_id: raw.source_id || src.id || null,
    source_kind: sourceKindForCourthouse(raw, src),
    provider: src.market || raw.provider || raw.source || 'Courthouse',
    source_confidence: sourceConfidence
  });
}

class LeadFormatter {
  format(raw, src) {
    const flags = this.detectFlags(raw, src);
    const auctionDate = this.parseDate(raw.auction_date);
    const isExpiring  = auctionDate && this.daysUntil(auctionDate) <= EXPIRING_DAYS;
    const normalized = normalizeCourthousePdfPayload(raw, src);

    // ── Core lead object matching existing WholesaleOS schema ──────
    const lead = {
      // Required fields matching existing bot format
      id:           uuid(),
      address:      raw.address || '',
      city:         raw.city || '',
      state:        raw.state || src.state,
      zip:          raw.zip || '',
      county:       raw.county || src.market,
      normalized_address: normalized.normalized_address || undefined,
      type:         this.mapLeadType(src.type),   // SFR / Multi / Land etc
      status:       'New Lead',
      created:      new Date().toISOString().slice(0, 10),
      source:       'courthouse',
      source_url:   src.url,
      source_record_url: normalized.source_record_url || null,
      source_pdf_url: normalized.source_pdf_url || null,
      source_confidence: normalized.source_confidence || null,

      // Wholesaling data
      lead_type:    src.type,
      owner_name:   raw.owner_name || '',
      mailing_addr: raw.mailing_addr || '',
      parcel:       raw.parcel || '',
      case_number:  raw.case_number || '',
      auction_date: raw.auction_date || '',
      days_to_auction: normalized.days_to_auction,
      years_delinquent: normalized.years_delinquent,
      lien_amount:  raw.lien_amount || '',
      doc_type:     raw.doc_type || src.type,
      filed_date:   raw.filed_date || '',

      // Estimated financials (filled by existing AI module if available)
      arv:          0,
      offer:        0,
      repairs:      0,
      spread:       0,
      equity_pct:   0,
      rent_estimate: 0,

      // Signal flags (wholesaling intelligence — module-local)
      priority_flags: flags,
      priority_flag:  flags[0] || 'courthouse',
      expiring_soon:  isExpiring,

      // Dashboard display helpers
      distress:      this.mapDistressLabel(src.type),
      why_good_deal: this.buildWhyGoodDeal(flags, auctionDate, src),

      // Module metadata — does NOT interfere with main bot
      _source_module: 'courthouse-addon',
      _market:        src.market,
      source_normalized: normalized,
      _courthouse_metadata: {
        lead_type:   src.type,
        market:      src.market,
        source_url:  src.url,
        source_pdf_url: normalized.source_pdf_url || null,
        source_record_url: normalized.source_record_url || null,
        source_confidence: normalized.source_confidence || null,
        auction_date: raw.auction_date || null,
        days_to_auction: normalized.days_to_auction,
        years_delinquent: normalized.years_delinquent,
        lien_amount: raw.lien_amount || null,
        case_number: raw.case_number || null,
        parcel:      raw.parcel || null,
        filed_date:  raw.filed_date || null,
        flags,
      },
    };

    return lead;
  }

  // ── Wholesaling signal detection ─────────────────────────────────
  detectFlags(raw, src) {
    const flags = [];
    const type  = (src.type || '').toLowerCase();
    const text  = JSON.stringify(raw).toLowerCase();

    // Foreclosure
    if (type.includes('foreclosure') || text.includes('foreclosure') || text.includes('lis pendens')) {
      flags.push('foreclosure');
    }

    // Probate
    if (type.includes('probate') || text.includes('probate') || text.includes('estate') || text.includes('letters testamentary')) {
      flags.push('probate');
    }

    // Tax delinquent
    if (type.includes('tax') || text.includes('delinquent') || text.includes('tax lien') || text.includes('tax deed')) {
      flags.push('tax_delinquent');
    }

    // Code violation
    if (type.includes('code') || type.includes('violation') || text.includes('code violation') || text.includes('blight')) {
      flags.push('code_violation');
    }

    // Fire damaged
    if (type.includes('fire') || text.includes('fire damage') || text.includes('fire damaged')) {
      flags.push('fire_damaged');
    }

    // Lien
    if (type.includes('lien') && !flags.includes('tax_delinquent')) {
      flags.push('lien');
    }

    // Expiring auction
    const auctionDate = this.parseDate(raw.auction_date);
    if (auctionDate && this.daysUntil(auctionDate) <= EXPIRING_DAYS) {
      flags.push('auction_expiring');
    }

    // Out-of-state owner (mailing address vs property state differ)
    if (raw.mailing_addr && raw.state) {
      const mailingState = raw.mailing_addr.match(/\b([A-Z]{2})\b\s*\d{5}/)?.[1];
      if (mailingState && mailingState !== raw.state) {
        flags.push('out_of_state_owner');
      }
    }

    // Vacant indicators
    if (text.includes('vacant') || text.includes('abandoned') || text.includes('unoccupied')) {
      flags.push('vacant');
    }

    // Bankruptcy
    if (type.includes('bankruptcy') || text.includes('bankruptcy') || text.includes('chapter 7') || text.includes('chapter 13')) {
      flags.push('bankruptcy');
    }

    // Divorce
    if (type.includes('divorce') || text.includes('dissolution') || text.includes('divorce')) {
      flags.push('divorce');
    }

    // High lien amount (proxy for potential equity)
    if (raw.lien_amount) {
      const amount = parseFloat(String(raw.lien_amount).replace(/[$,]/g, ''));
      if (amount > 0 && amount < 150000) {
        flags.push('potential_equity'); // small lien on property may mean equity
      }
    }

    return [...new Set(flags)]; // deduplicate
  }

  // ── Type mapping to existing bot property types ──────────────────
  mapLeadType(courtType) {
    const t = (courtType || '').toLowerCase();
    if (t.includes('multi'))   return 'Multi';
    if (t.includes('land'))    return 'Land';
    if (t.includes('mobile'))  return 'Mobile';
    if (t.includes('condo'))   return 'Condo';
    return 'SFR'; // default to single family
  }

  mapDistressLabel(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('foreclosure'))   return 'Foreclosure';
    if (t.includes('probate'))       return 'Probate';
    if (t.includes('tax'))           return 'Tax Delinquent';
    if (t.includes('code'))          return 'Code Violation';
    if (t.includes('fire'))          return 'Fire Damaged';
    if (t.includes('lien'))          return 'Lien';
    if (t.includes('bankruptcy'))    return 'Bankruptcy';
    if (t.includes('divorce'))       return 'Divorce';
    return 'Courthouse Record';
  }

  buildWhyGoodDeal(flags, auctionDate, src) {
    const parts = [];
    if (flags.includes('foreclosure') && auctionDate) {
      const days = this.daysUntil(auctionDate);
      parts.push(`Foreclosure auction in ${days} days — motivated seller or bank-owned opportunity`);
    }
    if (flags.includes('probate')) {
      parts.push('Probate property — heirs often sell below market to settle estate quickly');
    }
    if (flags.includes('tax_delinquent')) {
      parts.push('Tax delinquent — owner may need fast sale to avoid tax deed auction');
    }
    if (flags.includes('code_violation')) {
      parts.push('Code violation on record — distressed property, possible below-market acquisition');
    }
    if (flags.includes('fire_damaged')) {
      parts.push('Fire damaged — deep discount opportunity for rehab or lot value');
    }
    if (flags.includes('out_of_state_owner')) {
      parts.push('Out-of-state owner — absentee landlord often motivated to sell');
    }
    if (flags.includes('vacant')) {
      parts.push('Vacant property — abandoned/neglected, owner likely motivated');
    }
    if (flags.includes('potential_equity')) {
      parts.push('Small lien relative to likely property value — equity play');
    }
    return parts.join('. ') || `Courthouse lead from ${src.market} — ${src.type}`;
  }

  // ── Date utilities ───────────────────────────────────────────────
  parseDate(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  daysUntil(date) {
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  }
}

LeadFormatter.normalizeCourthousePdfPayload = normalizeCourthousePdfPayload;
module.exports = LeadFormatter;
