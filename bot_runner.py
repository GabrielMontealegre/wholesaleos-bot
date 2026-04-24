import os
import time
from scraper_engine import WholesaleScraper
from llm_manager import brain

# =================================================================
# CONFIGURATION: THE LEAD LIST
# =================================================================
# We start with your first batch of 10 URLs
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

def save_lead_to_db(lead_data):
    """
    This function handles saving the lead to your database.
    Since we want to keep the dashboard stable, we first print it 
    to the logs to verify the data is REAL.
    """
    print(f"--- NEW LEAD FOUND ---")
    print(lead_data)
    print("----------------------")
    
    # TODO: Once we verify the data in logs, we will plug in your 
    # specific Database 'Save' function here.
    # For now, we write to a local file so we don't lose any data.
    with open("found_leads.txt", "a") as f:
        f.write(str(lead_data) + "\n")

def run_wholesale_engine():
    print("🚀 Damian's Wholesale Engine is starting...")
    
    # Initialize the engine we built in the previous step
    engine = WholesaleScraper()
    
    print(f"Processing {len(TARGET_URLS)} target sources...")
    
    # Run the batch
    results = engine.run_batch(TARGET_URLS)
    
    # Process the results
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
    # This allows the bot to run once and then stop.
    # On Railway, we will set this to run every X hours.
    run_wholesale_engine()
