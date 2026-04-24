import os
import subprocess
import sys
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
    """
    THE NUCLEAR OPTION:
    This forces the server to download the browser if it's missing,
    bypassing Railway's build cache.
    """
    print("🛠️ Checking for browser installation...")
    try:
        # This runs the actual 'playwright install chromium' command inside the server
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        print("✅ Browser installation verified/completed.")
    except Exception as e:
        print(f"❌ Critical Error installing browser: {e}")
        sys.exit(1)

def save_lead_to_db(lead_data):
    print(f"--- NEW LEAD FOUND ---")
    print(lead_data)
    print("----------------------")
    with open("found_leads.txt", "a") as f:
        f.write(str(lead_data) + "\n")

def run_wholesale_engine():
    print("🚀 Damian's Wholesale Engine is starting...")
    
    # STEP 1: Force the browser to exist before doing anything else
    ensure_browser_installed()
    
    # STEP 2: Initialize the engine
    engine = WholesaleScraper()
    
    print(f"Processing {len(TARGET_URLS)} target sources...")
    
    # Run the batch
    results = engine.run_batch(TARGET_URLS)
    
    total_leads = 0
    for entry in results:
        url = entry['url']
        data = entry['data']
        
        if data and "NO_LEADS" not in str(data):
            print(f"✅ Success! Found data at {url}")
            save_lead_to_db(data)
            total_leads += 1
        else:
            print(f"❌ No valid leads found at {url}")

    print(f"🏁 Run Complete. Total leads captured: {total_leads}")

if __name__ == "__main__":
    run_wholesale_engine()
