#!/bin/bash
# Q2 Profit Dashboard startup script

export PATH="/opt/homebrew/Cellar/node@22/22.22.0/bin:$PATH"
export APPGROWTH_API_TOKEN="${APPGROWTH_API_TOKEN:-3c7004b4df8f7c9d645f8745f299bcdc}"

cd "$(dirname "$0")"
node server.js
