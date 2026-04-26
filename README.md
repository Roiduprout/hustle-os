# HUSTLE.OS — Installation

App de planification gamifiée avec notifications natives Mac et Windows.

## ⚡ Installation (5 minutes)

### Pré-requis
Tu as besoin de **Node.js** (≥ v18). Vérifie avec :

```bash
node --version
```

Si t'as pas Node : https://nodejs.org → télécharge la version LTS et installe.

### Étapes

**1. Décompresse le zip** quelque part (ex: `~/Documents/hustle-os/`)

**2. Ouvre un terminal dans le dossier** :
```bash
cd ~/Documents/hustle-os
```

**3. Installe les dépendances** (1ère fois seulement, ~30s) :
```bash
npm install
```

**4. Build l'app** :

**Sur Mac** :
```bash
npm run build:mac
```
→ Tu obtiens un `.dmg` dans `dist/HUSTLE.OS-1.0.0-arm64.dmg` (ou `-x64.dmg` selon ta machine).

**Sur Windows** :
```bash
npm run build:win
```
→ Tu obtiens un `.exe` installeur dans `dist/HUSTLE.OS Setup 1.0.0.exe`.

**5. Installe normalement** :
- **Mac** : double-clique le `.dmg`, glisse l'app dans Applications.
- **Windows** : double-clique l'`.exe`, l'installation est automatique.

## 🚀 Lancer l'app sans builder (mode dev)

Si tu veux juste tester avant de build :
```bash
npm install
npm start
```

L'app se lance directement.

## 🔔 Activer les notifications

1. Ouvre l'app
2. Clique sur **ACTIVER** dans le panneau "Check-in automatique"
3. Choisis l'intervalle (1h / 1h30 / 2h / 3h)
4. **Mac** : la 1ère notif te demande l'autorisation système → accepte
5. **Windows** : pareil, autorise dans la fenêtre système

✅ L'app continue de tourner en arrière-plan même quand tu fermes la fenêtre. Sur Mac, regarde dans la barre menu en haut à droite — y'a une icône H discrète. Click droit dessus pour le menu rapide.

## ⚙️ Démarrage automatique au login

Coche la case **"Démarrer automatiquement au login"** dans le panneau notifs.
L'app se lancera silencieusement au démarrage de ton ordi, juste les notifs tournent en arrière-plan.

## 🆘 Mac — "L'app ne peut pas être ouverte car son auteur n'est pas identifié"

L'app n'est pas signée Apple (faut un compte développeur payant à 99€/an pour ça).
**Solution** : right-click sur l'app → **Ouvrir** → confirme. À refaire qu'une seule fois.

Ou via terminal :
```bash
xattr -cr /Applications/HUSTLE.OS.app
```

## 📁 Où sont stockées tes données ?

- **Mac** : `~/Library/Application Support/HUSTLE.OS/hustle-data.json`
- **Windows** : `%APPDATA%\HUSTLE.OS\hustle-data.json`

Tu peux backup ce fichier ou le copier sur un autre ordi pour migrer.

## 🛠️ Personnaliser

- **Catégories** : modifie l'objet `CATEGORIES` dans `index.html`
- **Niveaux/titres** : objet `LEVELS`
- **Achievements** : array `ACHIEVEMENTS`
- **Avatars par niveau** : array `AVATARS`

Re-lance `npm start` pour tester ou `npm run build:mac` pour rebuilder.

---

Bug ou idée ? Dis-moi.
