import os
from groq import Groq
import google.generativeai as genai

class LLMManager:
    def __init__(self):
        self.groq_key = os.getenv("GROQ_API_KEY")
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        
        # Setup Groq (Llama 3.3)
        self.groq_client = Groq(api_key=self.groq_key)
        
        # Setup Gemini - Using the laest stable flash model
        genai.configure(api_key=self.gemini_key)
        self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')

    def fast_think(self, prompt):
        """Use Llama 3.3 for fast, cheap, simple tasks"""
        try:
            chat_completion = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
            )
            return chat_completion.choices[0].message.content
        except Exception as e:
            return f"Groq Error: {e}"

    def deep_think(self, prompt):
        """Use Gemini for big data, truth-checking, and complex analysis"""
        try:
            response = self.gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Gemini Error: {e}"

# Initialize the manager
brain = LLMManager()
