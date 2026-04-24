import os
from groq import Groq
import google.generativeai as genai

class LLMManager:
    def __init__(self):
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.groq_client = Groq(api_key=self.groq_key)
        genai.configure(api_key=self.gemini_key)
        # Updated to the most stable model string
        self.gemini_model = genai.GenerativeModel('gemini-pro')

    def fast_think(self, prompt):
        try:
            chat_completion = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            return f"Groq Error: {e}"

    def deep_think(self, prompt):
        """Tries Gemini first; if it fails, falls back to Llama 3.3"""
        try:
            response = self.gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            print(f"Gemini failed, falling back to Llama: {e}")
            return self.fast_think(f"CRITICAL: Process this data and return ONLY a clean list: {prompt}")

brain = LLMManager()
