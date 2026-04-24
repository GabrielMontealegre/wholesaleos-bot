#!/bin/bash

# 1. Start the AI Bot in the background
# This launches the Python engine to find leads
python bot_runner.py &

# 2. Start the Dashboard Server
# This launches the Node.js server so the website loads
node server.js
