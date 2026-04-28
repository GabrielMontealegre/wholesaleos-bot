import os
import requests
import json
from playwright.sync_api import sync_playwright
from llm_manager import brain

class EnrichmentAgent:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        }

    def get_property_intelligence(self, address, owner_name="Unknown"):
        """
        The Master Investigation: 
        1. Gets Comps from Zillow/Redfin
        2. Attempts Free Skip Tracing for phone numbers
        3. Uses AI to analyze the 'Why' (Distress signal)
        """
        print(f"🕵️ Investigating property: {address}")
        
        intelligence = {
            "comps": [],
            "estimated_arv": 0,
            "suggested_offer": 0,
            "phone_numbers": [],
            "emails": [],
            "distress_reason": "Unknown",
            "analysis_summary": ""
        }

        with sync_playwright() as p:
            # Launch browser with stealth settings to avoid blocks
            browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
            page = browser.new_page()
            
            try:
                # --- PART 1: COMPS & VALUATION (Zillow/Redfin) ---
                print(f"📈 Fetching comps for {address}...")
                search_url = f"https://www.zillow.com/homes/{address.replace(' ', '-')}_rb/"
                page.goto(search_url, wait_until="networkidle", timeout=60000)
                
                # We take the page content and let the AI extract the numbers
                page_content = page.content()
                comp_analysis = brain.deep_think(
                    f"Extract the Zestimate/Estimated Value and the prices of the 3 nearest 'Sold' homes from this HTML. "
                    f"Return ONLY a JSON object: {{'arv': number, 'comps': [price1, price2, price3]}}. HTML: {page_content[:20000]}"
                )
                
                try:
                    # Attempt to parse the AI response into the intelligence dict
                    import ast
                    parsed_comps = ast.literal_eval(comp_analysis) if isinstance(comp_analysis, str) else comp_analysis
                    intelligence['estimated_arv'] = parsed_comps.get('arv', 0)
                    intelligence['comps'] = parsed_comps.get('comps', [])
                    # Basic Wholesale Math: Offer = (ARV * 0.7) - Repairs (est. 10% of ARV)
                    intelligence['suggested_offer'] = (intelligence['estimated_arv'] * 0.6) 
                except:
                    print("⚠️ Could not parse comp data.")

                # --- PART 2: FREE SKIP TRACING (TruePeopleSearch/FastPeopleSearch) ---
                print(f"📞 Searching for phone numbers for {owner_name}...")
                # We use a search-based approach to find the profile link first
                search_query = f"site:truepeoplesearch.com '{owner_name}' '{address}'"
                profile_url = brain.fast_think(f"Find the direct TruePeopleSearch or FastPeopleSearch profile URL for {owner_name} at {address}. Return ONLY the URL.")
                
                if profile_url and "http" in profile_url:
                    page.goto(profile_url, wait_until="networkidle")
                    profile_content = page.content()
                    phone_data = brain.deep_think(
                        f"Extract all phone numbers and emails from this profile HTML. Return ONLY a JSON list: {{'phones': [], 'emails': []}}. HTML: {profile_content[:20000]}"
                    )
                    try:
                        import ast
                        parsed_phones = ast.literal_eval(phone_data) if isinstance(phone_data, str) else phone_data
                        intelligence['phone_numbers'] = parsed_phones.get('phones', [])
                        intelligence['emails'] = parsed_phones.get('emails', [])
                    except:
                        print("⚠️ Could not parse phone data.")

                browser.close()
            except Exception as e:
                print(f"❌ Investigation Error: {e}")
                browser.close()

        # --- PART 3: THE "WHY" (Llama 3.3 Analysis) ---
        # We combine the source of the lead with the found data to explain the deal
        intelligence['distress_reason'] = brain.fast_think(
            f"Property: {address}. Owner: {owner_name}. Found Comps: {intelligence['comps']}. "
            f"This lead came from a government data source. Explain in one sentence why this property is a "
            f"wholesale opportunity (e.g., tax lien, probate, foreclosure). Be specific."
        )
        
        intelligence['analysis_summary'] = brain.deep_think(
            f"Given an ARV of {intelligence['estimated_arv']} and distress reason {intelligence['distress_reason']}, "
            f"write a 2-sentence pitch for a cash buyer."
        )

        return intelligence
