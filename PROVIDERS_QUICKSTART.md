# Quick Start Guide - LEA/EASM Providers Tab

> Setup et test en 5 minutes

---

## PRÉREQUIS

- Node.js 18+
- PostgreSQL 14+ (ou Docker)

---

## ÉTAPE 1: Installer PostgreSQL

### Option A: Docker (Recommandé - 2 min)
```bash
docker run -d --name lea-postgres \
  -e POSTGRES_USER=lea \
  -e POSTGRES_PASSWORD=lea \
  -e POSTGRES_DB=lea_db \
  -p 5432:5432 \
  postgres:16-alpine
```

### Option B: Homebrew (macOS)
```bash
brew install postgresql@16
brew services start postgresql@16
createdb lea_db
```

### Option C: Linux (APT)
```bash
sudo apt update
sudo apt install postgresql-16
sudo -u postgres createdb lea_db
```

---

## ÉTAPE 2: Configurer Backend (1 min)

```bash
cd backend

# Installer dépendances
npm install

# Vérifier .env (déjà configuré)
cat .env

# Générer client Prisma
npx prisma generate

# Créer les tables
npx prisma migrate dev --name init

# Démarrer le backend
npm run dev
```

**Serveur démarre sur**: http://localhost:3001

---

## ÉTAPE 3: Démarrer Frontend (30 sec)

```bash
cd lea-ui

# Installer dépendances
npm install

# Démarrer le frontend
npm run dev
```

**Application ouvre sur**: http://localhost:5173

---

## ÉTAPE 4: Tester (1 min)

### 1. Accéder à l'onglet Providers
- Ouvrir http://localhost:5173
- Cliquer sur l'onglet "Providers"

### 2. Ajouter un provider
- Cliquer sur "Add Provider"
- Type: Anthropic
- Display Name: "Mon Compte Anthropic"
- API Key: `sk-ant-votre-clé-ici`
- Priority: 1
- ✅ Set as default
- Cliquer "Add Provider"

### 3. Tester la connexion
- Sur la carte du provider, cliquer "Test"
- Vert ✓ = Connexion réussie avec latence
- Rouge ✗ = Erreur (vérifier votre API key)

---

## API KEY DE TEST

Pour tester sans clé réelle, vous pouvez utiliser une clé fictive - le test échouera mais vous verrez le fonctionnement de l'UI.

**Clés de test (format valide)**:
```
Anthropic: sk-ant-api03-xxxxx
OpenAI: sk-xxxxx
Zhipu: xxxx.xxxxx
```

---

## DÉPANNAGE

### Erreur "Database connection failed"
```bash
# Vérifier PostgreSQL
docker ps | grep lea-postgres

# OU
brew services list | grep postgresql

# Vérifier connexion
psql -h localhost -U lea -d lea_db
```

### Erreur "Prisma Client not generated"
```bash
cd backend
npx prisma generate
```

### Erreur "Module not found"
```bash
cd backend
npm install

cd ../lea-ui
npm install
```

### Frontend ne se connecte pas au backend
Vérifier que le backend est lancé sur le port 3001:
```bash
curl http://localhost:3001/health
```

Devrait retourner: `{"status":"ok",...}`

---

## ARRÊTER LES SERVICES

```bash
# Backend: Ctrl+C dans le terminal

# Frontend: Ctrl+C dans le terminal

# PostgreSQL (Docker):
docker stop lea-postgres

# PostgreSQL (Homebrew):
brew services stop postgresql@16
```

---

## PROCHAINES ÉTAPES

Une fois fonctionnel:

1. **Ajouter vos vraies API keys**
   - Anthropic: https://console.anthropic.com/
   - OpenAI: https://platform.openai.com/api-keys
   - Zhipu: https://open.bigmodel.cn/

2. **Configurer plusieurs providers**
   - Ajoutez un provider de backup
   - Testez le système de fallback

3. **Explorer les fonctionnalités**
   - Modifier la priorité des providers
   - Voir les statistiques d'usage
   - Tester la santé des connexions

---

**Besoin d'aide?** Voir `PROVIDERS_IMPLEMENTATION_SUMMARY.md` pour les détails techniques.
