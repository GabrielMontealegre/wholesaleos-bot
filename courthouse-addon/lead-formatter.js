/**
 * LeadFormatter — converts parsed courthouse records into WholesaleOS lead objects
 * Adds wholesaling signal flags without touching existing bot format
 */

'use strict';

const { v4: uuid } = require('uuid');

// Days from now that qualifies as "expiring soon"
const EXPIRING_DAYS = 14;

class LeadFormatter {
  format(raw, src) {
    const flags = this.detectFlags(raw, src);
    const auctionDate = this.parseDate(raw.auction_date);
    const isExpiring  = auctionDate && this.daysUntil(auctionDate) <= EXPIRING_DAYS;

    // ── Core lead object matching existing WholesaleOS schema ──────
    const lead = {
      // Required fields matching existing bot format
      id:           uuid(),
      address:      raw.address || '',
      city:         raw.city || '',
      state:        raw.state || src.state,
      zip:          raw.zip || '',
      county:       raw.county || src.market,
      type:         this.mapLeadType(src.type),   // SFR / Multi / Land etc
      status:       'New Lead',
      created:      new Date().toISOString().slice(0, 10),
      source:       'courthouse',
      source_url:   src.url,

      // Wholesaling data
      lead_type:    src.type,
      owner_name:   raw.owner_name || '',
      mailing_addr: raw.mailing_addr || '',
      parcel:       raw.parcel || '',
      case_number:  raw.case_number || '',
      auction_date: raw.auction_date || '',
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
      _courthouse_metadata: {
        lead_type:   src.type,
        market:      src.market,
        source_url:  src.url,
        auction_date: raw.auction_date || null,
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

module.exports = LeadFormatter;
