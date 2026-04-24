import os
import pandas as pd
import requests
from playwright.sync_api import sync_playwright
from llm_manager import brain # Using our new Gemini/Llama brain

class WholesaleScraper:
    def __init__(self):
        self.headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"}

    def scrape_open_data(self, url):
        """Strategy for Goldmines: Socrata/ArcGIS portals"""
        print(f"Mining Open Data from: {url}")
        try:
            # Logic to handle Socrata API or CSV exports
            # This avoids 'fake' data by getting the raw table
            response = requests.get(url, headers=self.headers, timeout=15)
            # We use Gemini to analyze the page and find the actual data download link
            data_link = brain.fast_think(f"Find the direct CSV or API download link for this data page: {url}. Return ONLY the URL.")
            
            # Download the data
            df = pd.read_csv(data_link)
            return df.to_dict('records')
        except Exception as e:
            print(f"Open Data Error: {e}")
            return None

    def scrape_portal(self, url):
        """Strategy for Fortresses: Interaction required"""
        print(f"Interacting with Portal: {url}")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                page.goto(url, wait_until="networkidle")
                
                # 1. Handle Disclaimer/I Agree buttons automatically
                if "Disclaimer" in page.content() or "Agree" in page.content():
                    buttons = page.get_by_role("button", name="Agree").all() or page.get_by_text("I Agree").all()
                    if buttons:
                        buttons[0].click()
                        page.wait_for_load_state("networkidle")

                # 2. Grab the raw content of the page
                content = page.content()
                
                # 3. THE TRUTH FILTER: Send the raw HTML to Gemini to extract REAL leads
                # This stops the 'fake data' problem
                prompt = f"Analyze this raw HTML content from a government site: {content}. Extract a list of real property leads. For each lead, find: Address, Owner Name, Violation Type. If no real leads exist, return 'NO_LEADS'. Return as a clean list."
                leads = brain.deep_think(prompt)
                
                return leads
            except Exception as e:
                print(f"Portal Error: {e}")
                return None
            finally:
                browser.close()

    def run_batch(self, url_list):
        all_leads = []
        for url in url_list:
            if "data." in url or "hub.arcgis.com" in url:
                results = self.scrape_open_data(url)
            else:
                results = self.scrape_portal(url)
            
            if results:
                all_leads.append({"url": url, "data": results})
        return all_leads

# Example usage
if __name__ == "__main__":
    engine = WholesaleScraper()
    test_urls = [
        "https://data.mesaaz.gov/", 
        "https://www.sandiego.gov/development-services"
    ]
    print(engine.run_batch(test_urls))
