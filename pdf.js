// pdf.js — PDF generator for wholesale deal reports
// Generates professional one-page-per-property PDFs

const PDFDocument = require('pdfkit');

const NAVY   = '#0D1B2A';
const GOLD   = '#C9A84C';
const GREEN  = '#1E8449';
const RED    = '#C0392B';
const ORANGE = '#D35400';
const BLUE   = '#1B3A5C';
const WHITE  = '#FFFFFF';
const GREY   = '#F4F4F4';
const LTBLUE = '#EAF2FB';

function riskColor(risk) {
  if (risk === 'Low') return GREEN;
  if (risk === 'High') return RED;
  return ORANGE;
}

function addPropertyPage(doc, prop, analysis, rank, total) {
  // Header bar
  doc.rect(0, 0, 612, 72).fill(NAVY);
  doc.fillColor(GOLD).fontSize(10).font('Helvetica-Bold')
     .text(`RANK #${rank} of ${total}  —  ${prop.category}  —  ${prop.seller_type || 'Owner'}`, 20, 12);
  doc.fillColor(WHITE).fontSize(14).font('Helvetica-Bold')
     .text(prop.address, 20, 26, { width: 572 });
  doc.fillColor('#AABBCC').fontSize(9).font('Helvetica')
     .text(`${prop.type || 'SFR'}  |  ${prop.beds}BD/${prop.baths}BA  |  ${prop.sqft?.toLocaleString()} sqft  |  Built: ${prop.year}  |  County: ${prop.county}  |  ZIP: ${prop.zip}`, 20, 50);

  let y = 82;

  // ── Listing Details ─────────────────────────────────────────────────────
  sectionBar(doc, 'LISTING DETAILS  |  CONTACT  |  SOURCE', y);
  y += 18;
  const lDetails = [
    ['List Price', prop.list_price || 'N/A', 'Days on Market', String(prop.dom || 0)],
    ['Price Cuts', prop.reductions || 'N/A', 'Status', prop.status || 'Active'],
    ['Seller Type', prop.seller_type || 'Owner', 'Phone', prop.phone || 'Pull via county recorder'],
    ['Source', prop.source_url || 'foreclosurelistings.com', 'County', prop.county],
  ];
  drawTable(doc, lDetails, y, [90, 160, 90, 160], [LTBLUE, WHITE, LTBLUE, WHITE]);
  y += lDetails.length * 18 + 6;

  // ── Motivation ──────────────────────────────────────────────────────────
  sectionBar(doc, 'WHY THIS IS A DEAL — MOTIVATION AND DISTRESS SIGNALS', y, BLUE);
  y += 18;
  const bullets = analysis.motivation || prop.motivation || ['Distressed property requiring cash buyer solution.'];
  bullets.slice(0, 5).forEach(b => {
    doc.fillColor('#111').fontSize(8).font('Helvetica')
       .text(`  •  ${b}`, 20, y, { width: 572 });
    y += 13;
  });
  y += 4;

  // ── Numbers Table ───────────────────────────────────────────────────────
  sectionBar(doc, 'INVESTOR NUMBERS  |  YOUR ASSIGNMENT FEE  |  CLOSE TIMELINE', y, '#1A5276');
  y += 18;
  const arv     = analysis.arv     || prop.arv     || 0;
  const repairs = analysis.repairs || prop.repairs || 0;
  const mao     = analysis.mao     || Math.round(arv * 0.70 - repairs);
  const offer   = analysis.offer   || prop.offer   || Math.round(mao * 0.94);
  const fee_lo  = analysis.fee_lo  || prop.fee_lo  || 10000;
  const fee_hi  = analysis.fee_hi  || prop.fee_hi  || 20000;
  const profit  = mao - offer;

  const numRows = [
    ['After Repair Value (ARV)',          `$${arv.toLocaleString()}`,           analysis.arv_note    || ''],
    ['Estimated Repairs',                 `$${repairs.toLocaleString()}`,       analysis.repair_note || ''],
    ['70% Rule (ARV × 0.70 − Repairs)',   `$${mao.toLocaleString()}`,           'Industry-standard MAO formula'],
    ['Maximum Allowable Offer (MAO)',      `$${mao.toLocaleString()}`,           'Do NOT exceed this number'],
    ['SUGGESTED OFFER',                   `$${offer.toLocaleString()}`,         `${Math.round(offer/arv*100)}% of ARV — negotiating room built in`],
    ['YOUR ASSIGNMENT FEE TARGET',        `$${fee_lo.toLocaleString()} – $${fee_hi.toLocaleString()}`, analysis.fee_note || ''],
    ['Est. Profit for End Buyer',         `$${profit.toLocaleString()}`,        analysis.profit_note || ''],
    ['Close Timeline',                    analysis.close_time || '14-21 days cash', 'Texas non-judicial = fastest close in nation'],
  ];
  numRows.forEach((row, i) => {
    const bg = i === 4 ? '#FDF6E3' : i === 5 ? '#FEF9E7' : i % 2 === 0 ? WHITE : GREY;
    doc.rect(20, y, 572, 16).fill(bg);
    const labelColor = (i === 4 || i === 5) ? '#7D6608' : '#111';
    const valColor   = i === 4 ? GREEN : i === 5 ? GOLD : '#111';
    doc.fillColor(labelColor).fontSize(8).font(i === 4 || i === 5 ? 'Helvetica-Bold' : 'Helvetica')
       .text(row[0], 24, y + 4, { width: 185 });
    doc.fillColor(valColor).fontSize(8).font('Helvetica-Bold')
       .text(row[1], 215, y + 4, { width: 110, align: 'right' });
    doc.fillColor('#555').fontSize(7).font('Helvetica')
       .text(row[2], 335, y + 4, { width: 255 });
    doc.rect(20, y, 572, 16).stroke('#CCCCCC').lineWidth(0.3);
    y += 16;
  });
  y += 6;

  // ── Strategy ────────────────────────────────────────────────────────────
  sectionBar(doc, 'STRATEGY MATRIX  |  EXIT PLAN', y);
  y += 18;
  const strategies = analysis.strategies || [{ name: 'Wholesale Assignment', rating: 'BEST', why: 'Lock and assign to DFW cash buyer.' }];
  strategies.forEach(s => {
    const sc = s.rating === 'BEST' ? GREEN : s.rating === 'GOOD' ? '#0E6655' : ORANGE;
    doc.rect(20, y, 572, 15).fill(GREY).stroke('#CCC').lineWidth(0.3);
    doc.fillColor('#111').fontSize(8).font('Helvetica-Bold').text(s.name, 24, y + 4, { width: 140 });
    doc.rect(170, y + 2, 40, 11).fill(sc);
    doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold').text(s.rating, 172, y + 4, { width: 36, align: 'center' });
    doc.fillColor('#333').fontSize(7.5).font('Helvetica').text(s.why, 218, y + 4, { width: 370 });
    y += 15;
  });

  // Risk badge
  y += 4;
  const riskCol = riskColor(analysis.risk || 'Medium');
  doc.rect(20, y, 90, 20).fill(riskCol);
  doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold').text(`RISK: ${(analysis.risk || 'MEDIUM').toUpperCase()}`, 22, y + 6, { width: 86, align: 'center' });
  doc.fillColor('#333').fontSize(8).font('Helvetica').text(analysis.risk_note || 'Verify title and all liens before offer.', 118, y + 6, { width: 470 });
  y += 26;

  // ── Approach + Script ───────────────────────────────────────────────────
  sectionBar(doc, 'HOW TO APPROACH THIS SELLER  |  CALL SCRIPT', y, '#4A235A');
  y += 18;
  doc.fillColor('#333').fontSize(8).font('Helvetica-Bold').text('Approach: ', 24, y);
  doc.fillColor('#555').fontSize(8).font('Helvetica').text(analysis.approach_how || 'Call directly. Be empathetic. Offer fast cash close.', 75, y, { width: 515 });
  y += 14;
  doc.fillColor('#333').fontSize(8).font('Helvetica-Bold').text('Questions: ', 24, y);
  doc.fillColor('#555').fontSize(8).font('Helvetica').text(analysis.approach_q || '1) Payoff? 2) Liens? 3) Taxes current? 4) Close in 14 days?', 78, y, { width: 512 });
  y += 14;
  if (analysis.script) {
    doc.rect(20, y, 572, 0).stroke('#4A235A').lineWidth(0.5);
    doc.rect(20, y+2, 572, 30).fill('#F8F0FF');
    doc.fillColor('#4A235A').fontSize(8).font('Helvetica-Bold').text('Script: ', 24, y + 8);
    doc.fillColor('#333').fontSize(8).font('Helvetica').text(analysis.script, 65, y + 8, { width: 524, height: 24 });
    y += 36;
  }

  // Footer
  doc.rect(0, 780, 612, 18).fill(NAVY);
  doc.fillColor(GOLD).fontSize(7).font('Helvetica-Bold')
     .text(`WHOLESALE DEAL ANALYSIS  |  Gabriel Montsan — montsan.rei@gmail.com  |  Generated ${new Date().toLocaleDateString()}`, 0, 785, { align: 'center', width: 612 });
}

function sectionBar(doc, label, y, color = BLUE) {
  doc.rect(20, y, 572, 14).fill(color);
  doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold').text(label, 26, y + 3, { width: 560 });
}

function drawTable(doc, rows, y, widths, bgColors) {
  rows.forEach(row => {
    let x = 20;
    row.forEach((cell, i) => {
      const w = widths[i];
      const bg = bgColors[i] || WHITE;
      doc.rect(x, y, w, 16).fill(bg).stroke('#CCC').lineWidth(0.3);
      const isLabel = i % 2 === 0;
      doc.fillColor('#111').fontSize(7.5).font(isLabel ? 'Helvetica-Bold' : 'Helvetica')
         .text(String(cell).slice(0, 35), x + 4, y + 4, { width: w - 8 });
      x += w;
    });
    y += 16;
  });
}

// ── Main export: generate PDF buffer for array of leads ───────────────────
async function generateLeadsPDF(leads, analyses, title = 'Wholesale Deal Analysis') {
  return new Promise((resolve, reject) => {
    const buffers = [];
    const doc = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: false });

    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Cover page
    doc.addPage();
    doc.rect(0, 0, 612, 792).fill(NAVY);
    doc.fillColor(GOLD).fontSize(28).font('Helvetica-Bold').text(title, 40, 180, { align: 'center', width: 532 });
    doc.fillColor(WHITE).fontSize(14).font('Helvetica-Bold').text(`${leads.length} Properties — ${leads[0]?.county || 'DFW Metro'} Area`, 40, 230, { align: 'center', width: 532 });
    doc.fillColor('#AABBCC').fontSize(10).font('Helvetica').text(`Generated ${new Date().toLocaleDateString()} by WholesaleOS Bot`, 40, 260, { align: 'center', width: 532 });
    doc.fillColor('#AABBCC').fontSize(9).font('Helvetica').text(`Gabriel Montsan  |  montsan.rei@gmail.com  |  All figures estimated — perform full due diligence before offer`, 40, 290, { align: 'center', width: 532 });

    // Quick reference table
    doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold').text('Quick Reference — All Leads Ranked', 40, 340, { align: 'center', width: 532 });
    let ty = 370;
    // Header
    doc.rect(20, ty, 572, 16).fill(BLUE);
    ['#','Address','County','Offer','ARV','Fee','Category','Risk'].forEach((h, i) => {
      const xs = [22,42,202,282,342,402,452,532];
      doc.fillColor(WHITE).fontSize(7).font('Helvetica-Bold').text(h, xs[i], ty+4, { width: 40 });
    });
    ty += 16;
    leads.slice(0, 28).forEach((l, idx) => {
      const a = analyses[idx] || {};
      const bg = idx % 2 === 0 ? WHITE : GREY;
      doc.rect(20, ty, 572, 14).fill(bg);
      const arv   = a.arv   || l.arv   || 0;
      const offer = a.offer || l.offer || 0;
      const fee   = `$${(a.fee_lo||l.fee_lo||0).toLocaleString()}-${(a.fee_hi||l.fee_hi||0).toLocaleString()}`;
      const xs = [22,42,202,282,342,402,452,532];
      const vals = [String(idx+1), (l.address||'').slice(0,22), l.county||'', `$${Math.round(offer/1000)}K`, `$${Math.round(arv/1000)}K`, fee, l.category||'', a.risk||'Med'];
      vals.forEach((v, i) => {
        const w = [18,158,78,58,58,48,78,60][i];
        doc.fillColor('#222').fontSize(6.5).font('Helvetica').text(String(v).slice(0, 20), xs[i], ty+4, { width: w });
      });
      ty += 14;
    });

    // One page per property
    leads.forEach((lead, idx) => {
      doc.addPage();
      addPropertyPage(doc, lead, analyses[idx] || {}, idx + 1, leads.length);
    });

    doc.end();
  });
}

// ── Single property one-pager ─────────────────────────────────────────────
async function generateSinglePropertyPDF(lead, analysis) {
  return generateLeadsPDF([lead], [analysis], `Deal Analysis — ${lead.address}`);
}

module.exports = { generateLeadsPDF, generateSinglePropertyPDF };
