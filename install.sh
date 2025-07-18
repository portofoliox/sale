#!/usr/bin/env bash
echo "Installing dependencies..."
npm install
npm install -g pm2
mkdir -p bots uploads logs node_versions
echo "Setup complete. Run 'node panel.js'"
