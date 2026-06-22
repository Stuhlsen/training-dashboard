# 🚴 Training Dashboard

Statisches Dashboard für Radsport-Trainingsdaten. Gehostet auf GitHub Pages, Daten aus Notion (Plan 1) und intervals.icu (Plan 2).

## Architektur

```
Notion DB ──→ GitHub Action ──→ data/rides.json ──→ GitHub Pages (Frontend)
                  ↑                                        ↑
          Alle 6h oder manuell              HTML + CSS + Chart.js (statisch)
```

**Kein Netlify, kein Backend, keine laufenden Kosten.** Der API-Key liegt als GitHub Secret — nie im Browser.

## Projektstruktur

```
training-dashboard/
├── index.html
├── .env.example             ← Vorlage für lokale Secrets
├── .github/
│   └── workflows/
│       └── sync-data.yml    ← GitHub Action: Notion → JSON
├── scripts/
│   └── generate-data.js     ← Daten-Generator (ersetzt Netlify Function)
├── data/
│   └── rides.json           ← Generierte Trainingsdaten (committed)
└── assets/
    ├── css/
    │   ├── main.css
    │   ├── components.css
    │   ├── charts.css
    │   └── table.css
    └── js/
        ├── config.js        ← ⚙️  ALLE Einstellungen hier
        ├── utils.js
        ├── data.js          ← Datenladen + statischer Fallback
        ├── charts.js
        ├── overview.js
        ├── table.js
        ├── analysis.js
        └── app.js
```

## Setup

### 1. GitHub Repo erstellen

```bash
git init
git add .
git commit -m "init: training dashboard"
git remote add origin git@github.com:Stuhlsen/training-dashboard.git
git push -u origin main
```

### 2. GitHub Pages aktivieren

Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, Ordner: `/ (root)`

### 3. GitHub Secrets konfigurieren

Settings → Secrets and variables → Actions → New repository secret:

| Secret               | Wert                                 |
|----------------------|--------------------------------------|
| `NOTION_API_KEY`     | Notion Integration Token (`ntn_...`) |
| `NOTION_DATABASE_ID` | ID der Trainingsdatenbank            |

### 4. Ersten Sync auslösen

Actions → "Sync Training Data" → "Run workflow"

### 5. Lokale Entwicklung

```bash
# .env anlegen (nie committen!)
cp .env.example .env
# Werte eintragen...

# JSON lokal generieren
node scripts/generate-data.js

# Seite lokal testen (braucht HTTP-Server für fetch)
npx serve .
# oder: python3 -m http.server
```

## Häufige Anpassungen

### FTP aktualisieren
→ `assets/js/config.js`, Werte `ftp` und `eFTP` ändern.

### Neue Meilensteine
→ `assets/js/config.js`, Array `manualMilestones` erweitern.

### Daten manuell aktualisieren
→ Actions-Tab → "Sync Training Data" → "Run workflow"

## Migration von Netlify

Dieses Repo ersetzt das Netlify-Deployment. Änderungen:
- `netlify/functions/training.js` → `scripts/generate-data.js` (gleiche Logik, Datei-Output)
- `/.netlify/functions/training` → `./data/rides.json` (statische Datei statt Serverless)
- Netlify CLI / Deploy → GitHub Pages (automatisch)
- Netlify Env Vars → GitHub Secrets (für die Action)

## Nächste Schritte (Plan 2)

- [ ] intervals.icu API Integration im generate-data Skript
- [ ] Neue Felder: TSS, IF, VI, Aerobe Entkopplung, ATL/TSB
- [ ] Plan-Filter im Dashboard (Plan 1 / Plan 2 / Alle)
- [ ] Power Curve Chart
- [ ] Aerobe Entkopplung Trend-Chart
