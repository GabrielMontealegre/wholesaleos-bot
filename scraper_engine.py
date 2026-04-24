import os
import pandas as pd
import requests
import pdfplumber
from playwright.sync_api import sync_playwright
from llm_manager import brain # Gemini/Llama brain

class WholesaleScraper:
    def __init__(self):
        self.headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"}

    def read_pdf(self, file_path):
        """Extracts text from PDF files"""
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text += page.extract_text() + "\n"
        return text

    def read_excel(self, file_path):
        """Extracts data from Excel/CSV files"""
        if file_path.endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)
        return df.to_string()

    def download_file(self, url):
        """Downloads a file temporarily to the server"""
        local_filename = url.split('/')[-1]
        with requests.get(url, headers=self.headers, stream=True) as r:
            r.raise_for_status()
            with open(local_filename, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        return local_filename

    def scrape_open_data(self, url):
        """Strategy for Goldmines: Socrata/ArcGIS portals"""
        print(f"Mining Open Data from: {url}")
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            data_link = brain.fast_think(f"Find the direct CSV, Excel, or PDF download link for this data page: {url}. Return ONLY the URL.")
            
            if data_link and any(ext in data_link for ext in ['.pdf', '.csv', '.xlsx']):
                file_path = self.download_file(data_link)
                if data_link.endswith('.pdf'):
                    raw_data = self.read_pdf(file_path)
                elif data_link.endswith('.csv') or data_link.endswith('.xlsx'):
                    raw_data = self.read_excel(file_path)
                os.remove(file_path)
            else:
                df = pd.read_csv(data_link)
                raw_data = df.to_string()

            structured_leads = brain.deep_think(f"Convert this raw data into a structured list of leads with columns [Address, Owner, Violation, Date]: {raw_data}")
            return structured_leads
        except Exception as e:
            print(f"Open Data Error: {e}")
            return None

    def scrape_portal(self, url):
        """Strategy for Fortresses: Interaction required"""
        print(f"Interacting with Portal: {url}")
        with sync_playwright() as p:
            # ADDED RAILWAY FLAGS: These prevent the 'Executable' and 'Sandbox' errors
            browser = p.chromium.launch(
                headless=True, 
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            page = browser.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                
                if "Disclaimer" in page.content() or "Agree" in page.content():
                    buttons = page.get_by_role("button", name="Agree").all() or page.get_by_text("I Agree").all()
                    if buttons:
                        buttons[0].click()
                        page.wait_for_load_state("networkidle")

                content = page.content()
                prompt = f"Analyze this HTML: {content}. Extract real leads into columns [Address, Owner, Violation, Date]. If no leads, return 'NO_LEADS'."
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
