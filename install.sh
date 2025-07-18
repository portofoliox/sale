#!/data/data/com.termux/files/usr/bin/bash

echo "[ADPanel Installer] Se instalează dependințele..."
pkg update -y
pkg install -y nodejs git unzip

echo "[ADPanel Installer] Clonez proiectul..."
git clone https://github.com/USERNAME/ADPanel.git
cd ADPanel

echo "[ADPanel Installer] Instalez modulele npm..."
npm install
npm install -g pm2

echo "[ADPanel Installer] Creez foldere utile..."
mkdir -p uploads logs

echo "[ADPanel Installer] Pornez panelul pe portul 3000..."
node panel.js &

echo ""
echo "[✅ Gata!] Deschide în browser: http://localhost:3000 sau folosește ngrok"
