// email.js — Gmail sender using nodemailer
// Uses Gmail App Password (not your real password)

require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendEmail({ to, subject, body, attachments = [] }) {
  const mailOptions = {
    from:        `Gabriel Montsan — WholesaleOS <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text:        body,
    html:        body.replace(/\n/g, '<br>'),
    attachments,
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendDealToBuyer(buyer, lead, analysis, pdfBuffer = null) {
  const { generateBuyerEmail } = require('./ai');
  const emailData = await generateBuyerEmail(lead, buyer, analysis);

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    `Deal_${lead.address.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  return sendEmail({
    to:          buyer.email,
    subject:     emailData.subject,
    body:        emailData.body,
    attachments,
  });
}

async function sendSellerOutreach(lead, script) {
  if (!lead.email) return { success: false, error: 'No seller email on file' };
  const body = `Hi,

${script}

Please call or text me at your earliest convenience.

Gabriel Montsan
Wholesale Real Estate Investor
${process.env.GMAIL_USER}

P.S. — I buy homes in any condition, any situation, with cash. No repairs needed, no agent fees.`;

  return sendEmail({
    to:      lead.email,
    subject: `Regarding your property at ${lead.address}`,
    body,
  });
}

async function sendContractEmail(assignment, buyer, contractBuffer) {
  const body = `Hi ${buyer.contact},

Please find attached the assignment agreement for:

Property: ${assignment.property}
Assignment Fee: $${assignment.assignmentFee?.toLocaleString()}
Earnest Money: $${assignment.earnestMoney?.toLocaleString()}
Target Closing: ${assignment.closingDate}

Please review and sign at your earliest convenience. If you have any questions call or text me directly.

Gabriel Montsan
${process.env.GMAIL_USER}`;

  return sendEmail({
    to:      buyer.email,
    subject: `Assignment Agreement — ${assignment.property}`,
    body,
    attachments: contractBuffer ? [{
      filename:    `Assignment_${assignment.property.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`,
      content:     contractBuffer,
      contentType: 'application/pdf',
    }] : [],
  });
}

async function testConnection() {
  try {
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, sendDealToBuyer, sendSellerOutreach, sendContractEmail, testConnection };
