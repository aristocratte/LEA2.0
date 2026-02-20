# 🚀 LEA/EASM AI Platform - Scripts de Démarrage

Scripts shell pour démarrer et arrêter facilement tous les services.

---

## 📋 Scripts Disponibles

### `./start.sh`
Démarre le backend et le frontend en parallèle.

**Fonctionnalités:**
- ✅ Vérification de Node.js
- ✅ Vérification de PostgreSQL
- ✅ Installation automatique des dépendances
- ✅ Génération du client Prisma
- ✅ Logs séparés (backend/frontend)
- ✅ Gestion des PID
- ✅ Capture de Ctrl+C pour arrêt propre
- ✅ Nettoyage des ports si déjà utilisés

### `./stop.sh`
Arrête proprement tous les services.

**Fonctionnalités:**
- ✅ Arrêt du backend
- ✅ Arrêt du frontend
- ✅ Nettoyage des ports 3001 et 5173
- ✅ Suppression des fichiers PID

---

## 🎯 Utilisation

### Démarrer tous les services

```bash
./start.sh
```

Le script va:
1. Vérifier que PostgreSQL est lancé
2. Démarrer le backend sur le port 3001
3. Démarrer le frontend sur le port 5173
4. Afficher les URLs d'accès
5. Attendre (Ctrl+C pour arrêter)

### Arrêter tous les services

**Option 1: Ctrl+C**
Si le script start.sh est en cours, appuyez sur `Ctrl+C`

**Option 2: Script stop.sh**
```bash
./stop.sh
```

---

## 📁 Fichiers Générés

```
logs/
├── backend.log       # Logs du backend
├── backend.pid       # PID du backend
├── frontend.log      # Logs du frontend
└── frontend.pid      # PID du frontend
```

### Voir les logs en temps réel

```bash
# Backend
tail -f logs/backend.log

# Frontend
tail -f logs/frontend.log

# Les deux
tail -f logs/*.log
```

---

## 🔧 Dépannage

### Erreur "PostgreSQL ne semble pas être en cours d'exécution"

**Solution 1: Démarrer PostgreSQL avec Docker**
```bash
docker run -d --name lea-postgres \
  -e POSTGRES_USER=lea \
  -e POSTGRES_PASSWORD=lea \
  -e POSTGRES_DB=lea_db \
  -p 5432:5432 \
  postgres:16-alpine
```

**Solution 2: Homebrew (macOS)**
```bash
brew services start postgresql@16
```

### Erreur "Le port 3001/5173 est déjà utilisé"

Le script va automatiquement tuer les processus existants. Si ça ne fonctionne pas:

```bash
# Manuellement
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Les services ne démarrent pas

Vérifier les logs:
```bash
cat logs/backend.log
cat logs/frontend.log
```

---

## 📊 Accès aux Services

| Service | URL | Logs |
|---------|-----|------|
| **Backend** | http://localhost:3001 | `logs/backend.log` |
| **Frontend** | http://localhost:5173 | `logs/frontend.log` |
| **Health Check** | http://localhost:3001/health | - |

---

## 🛠️ Commandes Utiles

### Vérifier si les services tournent

```bash
# Backend
curl http://localhost:3001/health

# Frontend (doit retourner du HTML)
curl http://localhost:5173
```

### Voir les processus

```bash
# Avec les fichiers PID
cat logs/backend.pid
cat logs/frontend.pid

# Avec lsof
lsof -i :3001
lsof -i :5173
```

### Redémarrer un service

```bash
# Arrêter
./stop.sh

# Redémarrer
./start.sh
```

---

## ⚡ Tips

1. **Premier lancement**: Le script va installer les dépendances automatiquement
2. **Logs**: Consultez `logs/*.log` pour debugger
3. **Ports**: Backend=3001, Frontend=5173
4. **Arrêt propre**: Utilisez toujours `./stop.sh` ou Ctrl+C

---

## 📝 Note

Les scripts créent automatiquement le dossier `logs/` s'il n'existe pas.
