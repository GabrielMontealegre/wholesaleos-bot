// email.js — Gmail OAuth2 primary, SMTP app-password fallback
require('dotenv').config();
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

async function createTransporter() {
  // Try OAuth2 first
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) reject(new Error('OAuth token failed: ' + err.message));
        else resolve(token);
      });
    });
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type:         'OAuth2',
        user:         process.env.GMAIL_USER,
        clientId:     process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken,
      },
    });
  } catch (oauthErr) {
    // Fallback to SMTP with App Password (never expires)
    console.warn('[email] OAuth failed, using SMTP fallback: ' + oauthErr.message);
    if (!process.env.GMAIL_APP_PASSWORD) {
      throw new Error('OAuth failed and GMAIL_APP_PASSWORD not set. Add it in Railway env vars.');
    }
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
}

async function sendEmail({ to, subject, body, attachments = [] }) {
  try {
    const transporter = await createTransporter();
    const info = await transporter.sendMail({
      from:        `Gabriel Montsan — WholesaleOS <${process.env.GMAIL_USER}>`,
      to, subject,
      text:        body,
      html:        body.replace(/\n/g, '<br>'),
      attachments,
    });
    console.log('Email sent:', info.messageId);
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
  return sendEmail({ to: buyer.email, subject: emailData.subject, body: emailData.body, attachments });
}

async function sendSellerOutreach(lead, script) {
  if (!lead.email) return { success: false, error: 'No seller email on file' };
  const body = `Hi,\n\n${script}\n\nPlease call or text me at your earliest convenience.\n\nGabriel Montsan\nWholesale Real Estate Investor\n${process.env.GMAIL_USER}\n\nP.S. I buy homes in any condition with cash. No repairs, no agent fees.`;
  return sendEmail({ to: lead.email, subject: `Regarding your property at ${lead.address}`, body });
}

async function sendContractEmail(assignment, buyer, contractBuffer) {
  const body = `Hi ${buyer.contact},\n\nPlease find attached the assignment agreement for:\n\nProperty: ${assignment.property}\nAssignment Fee: $${assignment.assignmentFee?.toLocaleString()}\nEarnest Money: $${assignment.earnestMoney?.toLocaleString()}\nTarget Closing: ${assignment.closingDate}\n\nPlease review and sign at your earliest convenience.\n\nGabriel Montsan\n${process.env.GMAIL_USER}`;
  const attachments = contractBuffer ? [{ filename: `Assignment_${assignment.property.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)}.pdf`, content: contractBuffer, contentType: 'application/pdf' }] : [];
  return sendEmail({ to: buyer.email, subject: `Assignment Agreement — ${assignment.property}`, body, attachments });
}

async function testConnection() {
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    return { success: true, method: 'connected' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmail, sendDealToBuyer, sendSellerOutreach, sendContractEmail, testConnection };
