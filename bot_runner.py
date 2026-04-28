import os
import json
import subprocess
import sys
import uuid
from datetime import datetime
from scraper_engine import WholesaleScraper
from llm_manager import brain
from enrichment_agent import EnrichmentAgent

# =================================================================
# CONFIGURATION
# =================================================================
SOURCES_FILE = 'sources.json'

def ensure_browser_installed():
    print("🛠️ Checking browser...")
    try:
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        print("✅ Browser Ready.")
    except Exception as e:
        print(f"❌ Browser Error: {e}")

def save_lead_to_db(lead_data):
    """
    Robustly saves a lead to /app/data/db.json.
    Handles all errors gracefully and converts string input to {"raw_data": ...}.
    """
    try:
        db_folder = '/app/data'
        db_path = os.path.join(db_folder, 'db.json')

        # Convert lead_data to dict if it is a string
        if isinstance(lead_data, str):
            lead_data = {"raw_data": lead_data}
        elif not isinstance(lead_data, dict):
            # For all other non-dict and non-string types, convert to string in "raw_data"
            lead_data = {"raw_data": str(lead_data)}

        # Ensure the DB directory exists
        try:
            if not os.path.exists(db_folder):
                os.makedirs(db_folder, exist_ok=True)
        except Exception as e:
            print(f"❌ Could not create db folder: {e}")
            return

        # If DB does not exist, initialize it
        if not os.path.exists(db_path):
            try:
                with open(db_path, 'w') as f:
                    json.dump({"leads": [], "users": [], "buyers": []}, f, indent=2)
            except Exception as e:
                print(f"❌ Could not initialize db.json: {e}")
                return

        # Safely read and update the DB file
        try:
            with open(db_path, 'r+') as f:
                try:
                    content = f.read().strip()
                    data = json.loads(content) if content else {"leads": [], "users": [], "buyers": []}
                except Exception as e:
                    print(f"❌ Corrupt db.json. Reinitializing. ({e})")
                    data = {"leads": [], "users": [], "buyers": []}

                data.setdefault("leads", [])

                # Prepare the new lead entry
                new_lead = {
                    "id": str(uuid.uuid4()),
                    "created": datetime.now().isoformat(),
                    "status": "New Lead",
                    "source": "MontSan REI Engine"
                }
                # Merge user-passed data last (safe overwrite)
                new_lead.update(lead_data)

                data["leads"].append(new_lead)

                # Persist to disk
                f.seek(0)
                json.dump(data, f, indent=2)
                f.truncate()
        except Exception as e:
            print(f"❌ Could not update db.json: {e}")
            return

        print(f"💾 Lead saved to {db_path}")

    except Exception as e:
        print(f"❌ DB Error (catastrophic): {e}")

def run_wholesale_engine():
    print("🚀 MontSan REI Engine Starting...")
    ensure_browser_installed()
    
    # Load sources from JSON file
    try:
        with open(SOURCES_FILE, 'r') as f:
            sources_data = json.load(f)
            urls = [s['url'] for s in sources_data]
    except Exception as e:
        print(f"❌ Could not load sources.json: {e}")
        return

    scraper = WholesaleScraper()
    agent = EnrichmentAgent()
    
    print(f"Processing {len(urls)} sources...")
    
    for url in urls:
        print(f"Checking: {url}")
        try:
            # 1. Scrape raw lead data
            # Note: We are using a simplified call to avoid complex batching for now
            # We simulate the run_batch logic here for stability
            if "data." in url or "hub.arcgis.com" in url:
                raw_results = scraper.scrape_open_data(url)
            else:
                raw_results = scraper.scrape_portal(url)
            
            if not raw_results or "NO_LEADS" in str(raw_results):
                print(f"❌ No leads at {url}")
                continue

            # 2. If the results are a list, process each lead
            if isinstance(raw_results, list):
                for lead in raw_results:
                    # Enrich the lead (Zillow/Phone)
                    enriched = agent.get_property_intelligence(lead.get('address', 'Unknown'))
                    
                    # Merge enrichment data into lead
                    if enriched:
                        for k, v in enriched.items():
                            lead[k] = v
                    
                    save_lead_to_db(lead)
            else:
                # Single lead found
                enriched = agent.get_property_intelligence(raw_results.get('address', 'Unknown'))
                if enriched:
                    for k, v in enriched.items():
                        raw_results[k] = v
                save_lead_to_db(raw_results)
                
        except Exception as e:
            print(f"⚠️ Error processing {url}: {e}")

    print("🏁 Run Complete.")

if __name__ == "__main__":
    run_wholesale_engine()
