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
            # Use Gemini to find the BEST download link on the page
            data_link = brain.fast_think(f"Find the direct CSV, Excel, or PDF download link for this data page: {url}. Return ONLY the URL.")
            
            if any(ext in data_link for ext in ['.pdf', '.csv', '.xlsx']):
                file_path = self.download_file(data_link)
                if data_link.endswith('.pdf'):
                    raw_data = self.read_pdf(file_path)
                elif data_link.endswith('.csv') or data_link.endswith('.xlsx'):
                    raw_data = self.read_excel(file_path)
                os.remove(file_path) # Clean up server space
            else:
                # If it's a direct CSV link, read it with pandas
                df = pd.read_csv(data_link)
                raw_data = df.to_string()

            # Use Gemini to turn the raw text into structured columns
            structured_leads = brain.deep_think(f"Convert this raw data into a structured list of leads with columns [Address, Owner, Violation, Date]: {raw_data}")
            return structured_leads
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
                
                # Handle Disclaimer/Agree buttons
                if "Disclaimer" in page.content() or "Agree" in page.content():
                    buttons = page.get_by_role("button", name="Agree").all() or page.get_by_text("I Agree").all()
                    if buttons:
                        buttons[0].click()
                        page.wait_for_load_state("networkidle")

                # Check for any download links on the page
                links = page.locator("a").all_inner_texts()
                # Gemini checks if any of these links look like a lead list
                download_target = brain.fast_think(f"Looking at these links: {links}, which one is most likely a downloadable lead list (PDF/CSV/Excel)? Return ONLY the text of the link.")
                
                # If a download is found, we'd trigger it here (simplified for now)
                
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
