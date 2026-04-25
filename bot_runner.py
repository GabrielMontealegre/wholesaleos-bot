import os
import json
import subprocess
import sys
import uuid
import ast
from datetime import datetime
from scraper_engine import WholesaleScraper
from llm_manager import brain

# =================================================================
# CONFIGURATION: THE LEAD LIST
# =================================================================
TARGET_URLS = [
    "https://www.muni.org/Departments/OCPD/development-services/permits-inspections/pages/default.aspx",
    "https://permits.jccal.org/CitizenAccess/Cap/CapApplyDisclaimer.aspx?module=Enforcement&TabName=Enforcement&TabList=Home%7C0%7CESDPermits%7C1%7CBuilding%7C2%7CPlanning%7C3%7CLicenses%7C4%7CEnforcement%7C5%7CCurrentTabIndex%7C5",
    "https://pulaskiclerkar.gov/news-events/auction-notices/",
    "https://data.mesaaz.gov/",
    "https://www.superiorcourt.maricopa.gov/docket/calendar/",
    "https://acclaim.pinalcountyaz.gov/AcclaimWeb/Search/Disclaimer?st=/AcclaimWeb/search/SearchTypeDocType",
    "https://hub.arcgis.com/maps/8026de93be8147d2aa2941c3e7ceed97",
    "https://pimacountyaz-web.tylerhost.net/web/search/DOCSEARCH55S8",
    "https://data.lacity.org/City-Infrastructure-Service-Requests/Building-and-Safety-Code-Enforcement-Case/2uz8-3tj3",
    "https://www.sandiego.gov/development-services"
]

def ensure_browser_installed():
    """Ensures Playwright has the browser ready on the server"""
    print("🛠️ Checking for browser installation...")
    try:
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        print("✅ Browser installation verified.")
    except Exception as e:
        print(f"❌ Browser Error: {e}")

def save_lead_to_db(lead_data):
    """Saves the lead to the CORRECT Railway persistent volume path (/app/data/db.json)"""
    try:
        # Using the persistent volume path from the Handover Document
        db_folder = '/app/data'
        db_path = os.path.join(db_folder, 'db.json')
        
        # 1. Ensure the data folder exists
        if not os.path.exists(db_folder):
            os.makedirs(db_folder)
            print(f"📁 Created missing data folder at {db_folder}")

        # 2. Ensure the db.json file exists
        if not os.path.exists(db_path):
            with open(db_path, 'w') as f:
                json.dump({"leads": [], "users": [], "buyers": []}, f)

        # 3. Read existing data
        with open(db_path, 'r+') as f:
            try:
                content = f.read()
                data = json.loads(content) if content else {"leads": [], "users": [], "buyers": []}
            except json.JSONDecodeError:
                data = {"leads": [], "users": [], "buyers": []}

            if "leads" not in data: 
                data["leads"] = []
            
            # 4. Clean the AI response (Convert string to dictionary if needed)
            processed_data = {}
            if isinstance(lead_data, str):
                try:
                    # Attempt to convert string representation of dict to actual dict
                    processed_data = ast.literal_eval(lead_data)
                    if not isinstance(processed_data, dict):
                        processed_data = {"raw_data": lead_data}
                except:
                    processed_data = {"raw_data": lead_data}
            elif isinstance(lead_data, dict):
                processed_data = lead_data
            else:
                processed_data = {"raw_data": str(lead_data)}

            # 5. Create the final lead entry with correct metadata
            lead_entry = {
                "id": str(uuid.uuid4()),
                "created": datetime.now().isoformat(),
                "status": "New Lead",
                "source": "MontSan REI Engine",
                **processed_data # Merges the actual lead data into the entry
            }
            
            # 6. Append and save
            data["leads"].append(lead_entry)
            f.seek(0)
            json.dump(data, f, indent=2)
            f.truncate()
            
        print(f"💾 Lead successfully saved to {db_path}")
    except Exception as e:
        print(f"❌ Database Error: {e}")

def run_wholesale_engine():
    print("🚀 MontSan REI Engine is starting...")
    ensure_browser_installed()
    
    engine = WholesaleScraper()
    print(f"Processing {len(TARGET_URLS)} target sources...")
    
    results = engine.run_batch(TARGET_URLS)
    
    total_leads = 0
    for entry in results:
        url = entry['url']
        data = entry['data']
        
        # Only save if data was found and it's not a 'NO_LEADS' message
        if data and "NO_LEADS" not in str(data):
            print(f"✅ Success! Found data at {url}")
            save_lead_to_db(data)
            total_leads += 1
        else:
            print(f"❌ No valid leads found at {url}")

    print(f"🏁 Run Complete. Total leads captured: {total_leads}")

if __name__ == "__main__":
    run_wholesale_engine()
