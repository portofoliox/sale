#!/usr/bin/env bash
echo "Installing dependencies..."
npm install
echo "Setup complete. Start panel: nohup node panel.js > /dev/null 2>&1 &"
