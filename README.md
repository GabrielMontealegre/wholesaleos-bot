# WholesaleOS Bot — Setup Guide
## Gabriel's Wholesale Automation System

---

## STEP 1 — Get Your Telegram User ID
1. Open Telegram
2. Search @userinfobot
3. Send /start
4. Copy the number it gives you — that's your BOT_OWNER_ID

---

## STEP 2 — Get Gmail App Password
(This is NOT your real Gmail password — it's a special 16-character password just for the bot)

1. Go to myaccount.google.com
2. Click "Security" in the left menu
3. Under "How you sign in to Google" click "2-Step Verification"
4. Enable 2-Step Verification if not already on
5. Scroll down to "App passwords"
6. Click "App passwords"
7. Select app: "Mail" / Select device: "Other (custom name)" → type "WholesaleOS"
8. Click Generate
9. Copy the 16-character password (no spaces)
10. Save as GMAIL_APP_PASSWORD in Railway

---

## STEP 3 — Get Free Groq API Key (Llama AI)
1. Go to console.groq.com
2. Sign up free — no credit card
3. Click "API Keys" → "Create API Key"
4. Name it "WholesaleOS"
5. Copy the key (starts with gsk_)
6. Save as GROQ_API_KEY in Railway

---

## STEP 4 — Get Your New Telegram Bot Token
1. Open Telegram → search @BotFather
2. Send /newbot (or use your existing bot after revoking)
3. Follow prompts → copy the token
4. Save as TELEGRAM_BOT_TOKEN in Railway
5. NEVER paste this token in any chat

---

## STEP 5 — Deploy to Railway
1. Go to railway.com → your project
2. Click "New Service" → "Deploy from GitHub repo"
   OR drag this folder into Railway
3. Go to Variables tab and add ALL of these:

   TELEGRAM_BOT_TOKEN   = [your new token]
   BOT_OWNER_ID         = [your Telegram user ID from Step 1]
   GROQ_API_KEY         = [from Step 3]
   GMAIL_USER           = montsan.rei@gmail.com
   GMAIL_APP_PASSWORD   = [16-char from Step 2]
   AI_MODE              = free
   PORT                 = 3000

4. Railway will auto-deploy. Check logs for "WholesaleOS Bot started"

---

## STEP 6 — Test Your Bot
1. Open Telegram → find your bot
2. Send /start
3. Send /test — should show all green checkmarks
4. Send /leads Dallas 10 — should generate a PDF with 10 leads

---

## BOT COMMANDS REFERENCE

/leads Dallas 200          → Find 200 leads in Dallas County (PDF delivered)
/leads Tarrant 100 Pre-FC  → Specific category
/pipeline                  → View your deal pipeline
/buyers                    → List all buyers
/addbuyer Name|Type|Contact|Phone|Email|$100K-$400K
/match [lead-id]           → Find buyers for a lead
/send [lead-id] [buyer]    → Email deal to buyer (PDF attached)
/reach [lead-id]           → Send outreach to seller
/add                       → Add a lead manually
/addlead [pipe-separated]  → Quick add with data
/status [lead] [status]    → Update lead status
/calendar                  → Upcoming events
/remind 2026-04-15 Closing date for Fort Worth deal
/stats                     → Dashboard summary
/mode free                 → Switch to Llama (free)
/mode premium              → Switch to Claude (pay-per-use)
/test                      → Test all connections
/help                      → Full command list

---

## UPGRADING TO CLAUDE (Premium)

1. Go to console.anthropic.com
2. Sign up → verify phone → create API key
3. Add to Railway: ANTHROPIC_API_KEY = sk-ant-api03-...
4. Add $5 credit to start
5. Text your bot: /mode premium

Cost: ~$3-4 per 400-property analysis run

---

## ADDING BATCHED LEADS DATA (BatchLeads)

When ready to add real owner data + phone numbers:
1. Sign up at batchleads.io
2. Enable API access in account settings
3. Get your API key
4. Add to Railway: BATCHLEADS_API_KEY = your_key
5. Cost: $97/month — pays for itself on first deal

---

## TOTAL MONTHLY COST (without BatchLeads)
- Telegram Bot:  $0
- Groq/Llama:    $0
- Gmail:         $0
- Railway:       $0 (free tier covers this easily)
- Database:      $0 (local JSON file)
TOTAL:           $0/month

Claude API runs: ~$3-4 only when you use premium mode
