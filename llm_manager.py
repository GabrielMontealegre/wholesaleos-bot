import os
from groq import Groq
import google.generativeai as genai

class LLMManager:
    def __init__(self):
        # API Keys are pulled from Railway Variables for safety
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        
        # Setup Groq (Llama 3.3)
        self.groq_client = Groq(api_key=self.groq_key)
        
        # Setup Gemini
        genai.configure(api_key=self.gemini_key)
        self.gemini_model = genai.GenerativeModel('gemini-1.5-pro')

    def fast_think(self, prompt):
        """Use Llama 3.3 for fast, cheap, simple tasks"""
        chat_completion = self.groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
        )
        return chat_completion.choices[0].message.content

    def deep_think(self, prompt):
        """Use Gemini for big data, truth-checking, and complex analysis"""
        response = self.gemini_model.generate_content(prompt)
        return response.text

# Initialize the manager
brain = LLMManager()
