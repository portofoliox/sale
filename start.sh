#!/usr/bin/env bash
echo "Starting panel in background..."
nohup node panel.js > logs/panel.log 2>&1 &
echo "Panel started. Logs: logs/panel.log"
