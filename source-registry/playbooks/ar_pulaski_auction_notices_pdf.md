# Pulaski County AR Auction Notices

Category: auction

Interface: document index / PDF notices.

Adapter: `pdf_list_adapter`

Valid lead requires:
- property address
- file/page/row reference or equivalent document reference

Expected evidence:
- source index URL
- notice PDF URL
- file name
- file hash
- page number
- row number or text block reference
- sale date if visible

Freshness:
Use notice post date and PDF/file date. Stale after auction date, or after 14 days if no sale date is parsed.

Verification:
Open the notice index/PDF and verify file, page, row, address, and sale date before outreach.

Repair workflow:
Route OCR failure, missing address, missing sale date, weak row mapping, or malformed PDF extraction to source repair.
