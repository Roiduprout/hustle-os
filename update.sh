#!/bin/bash
# HUSTLE.OS — Script de mise à jour automatique
# Usage: bash update.sh

set -e  # Stop si erreur

echo ""
echo "🚀 HUSTLE.OS — Mise à jour"
echo "================================"
echo ""

# Vérifie qu'on est dans le bon dossier
if [ ! -f "package.json" ] || [ ! -f "main.js" ]; then
  echo "❌ Erreur : tu dois lancer ce script depuis le dossier hustle-os"
  echo "   Tape d'abord : cd ~/Desktop/hustle-os"
  exit 1
fi

# Vérifie Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js n'est pas installé."
  echo "   Télécharge-le sur https://nodejs.org puis relance ce script."
  exit 1
fi

echo "✓ Node $(node --version) détecté"
echo ""

# Quitte l'ancienne instance de l'app si elle tourne
echo "🛑 Fermeture de l'ancienne version (si elle tourne)..."
pkill -f "HUSTLE.OS" 2>/dev/null || true
sleep 1

# Installe les dépendances si besoin
if [ ! -d "node_modules" ]; then
  echo "📦 Installation des dépendances (1ère fois, ~30s)..."
  npm install
else
  echo "✓ Dépendances déjà installées"
fi
echo ""

# Build
echo "🔨 Build de l'app en cours (1-2 minutes)..."
echo ""
npm run build:mac

echo ""
echo "✓ Build terminé"
echo ""

# Trouve le dmg
DMG=$(ls dist/HUSTLE.OS-*-arm64.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  DMG=$(ls dist/HUSTLE.OS-*.dmg 2>/dev/null | grep -v arm64 | head -1)
fi

if [ -z "$DMG" ]; then
  echo "❌ DMG introuvable dans dist/"
  exit 1
fi

echo "📦 Installation de la nouvelle version..."

# Mount le dmg
MOUNT_OUTPUT=$(hdiutil attach "$DMG" -nobrowse 2>&1)
MOUNT_POINT=$(echo "$MOUNT_OUTPUT" | grep -E "/Volumes/" | tail -1 | awk -F'\t' '{print $NF}')

if [ -z "$MOUNT_POINT" ]; then
  echo "❌ Impossible de monter le DMG"
  exit 1
fi

echo "✓ DMG monté sur $MOUNT_POINT"

# Supprime l'ancienne app si elle existe
if [ -d "/Applications/HUSTLE.OS.app" ]; then
  echo "🗑  Suppression de l'ancienne version..."
  rm -rf "/Applications/HUSTLE.OS.app"
fi

# Copie la nouvelle
echo "📋 Copie de la nouvelle version vers /Applications..."
cp -R "$MOUNT_POINT/HUSTLE.OS.app" /Applications/

# Démonte le dmg
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

# Retire le quarantine flag pour pas qu'OS demande à chaque fois
xattr -cr /Applications/HUSTLE.OS.app 2>/dev/null || true

echo ""
echo "================================"
echo "✅ Mise à jour terminée !"
echo "================================"
echo ""
echo "Tu peux ouvrir HUSTLE.OS depuis :"
echo "  • Spotlight (Cmd+Espace → Hustle)"
echo "  • Launchpad"
echo "  • /Applications"
echo ""

# Lance l'app
read -p "Lancer HUSTLE.OS maintenant ? (o/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Oo]$ ]]; then
  open /Applications/HUSTLE.OS.app
  echo "🚀 HUSTLE.OS lancé"
fi

echo ""
