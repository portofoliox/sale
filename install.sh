#!/usr/bin/env bash
echo "Installing dependencies..."
npm install
echo "Starting panel in background..."
nohup node panel.js > logs/panel.log 2>&1 &
echo "Setup complete. Panel running in background."
