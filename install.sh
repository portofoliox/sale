#!/data/data/com.termux/files/usr/bin/bash

echo "[ADPanel v2 Installer] Se instalează dependințele..."
pkg update -y
pkg install -y nodejs git unzip

echo "[ADPanel v2 Installer] Instalez modulele npm..."
npm install
npm install -g pm2

mkdir -p uploads logs bots

echo "[ADPanel v2 Installer] Pornez panelul pe portul 3000..."
node panel.js &

echo ""
echo "[✅ Gata!] Deschide în browser: http://localhost:3000"
