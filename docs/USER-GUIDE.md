# LEA Platform - Guide Utilisateur

## Table des matières

1. [Introduction](#introduction)
2. [Premiers pas](#premiers-pas)
3. [Tableau de bord](#tableau-de-bord)
4. [Créer un Pentest](#créer-un-pentest)
5. [Interface de chat](#interface-de-chat)
6. [Export de données](#export-de-données)
7. [Configuration des providers](#configuration-des-providers)
8. [Commandes slash](#commandes-slash)
9. [Gestion des fichiers](#gestion-des-fichiers)
10. [Dépannage](#dépannage)

---

## Introduction

LEA Platform est une solution de pentest automatisée alimentée par l'IA. Elle permet de réaliser des tests de pénétration complets avec l'assistance d'agents IA spécialisés.

### Fonctionnalités principales

- Pentest automatisé avec agents IA
- Intégration MCP Kali Linux
- Vérifications preflight en temps réel
- Tableau de bord avec métriques et graphiques
- Export de conversations et rapports de vulnérabilités
- Support multi-providers (Anthropic, Zhipu, OpenAI)

---

## Premiers pas

### Accès à la plateforme

1. Ouvrez votre navigateur à l'adresse `http://localhost:3000`
2. La page d'accueil affiche le tableau de bord

### Configuration initiale

Avant de commencer un pentest, configurez vos providers IA :

1. Allez dans **Settings** (Paramètres)
2. Sélectionnez **Providers**
3. Ajoutez vos clés API pour les services souhaités :
   - **Anthropic** : Claude Sonnet, Opus
   - **Zhipu AI** : GLM-4
   - **OpenAI** : GPT-4
4. Testez la connexion avec le bouton **Test**

---

## Tableau de bord

Le tableau de bord affiche une vue d'ensemble de vos activités :

### Statistiques en temps réel

- **Scans actifs** : Nombre de pentests en cours
- **Scans en attente** : File d'attente
- **Scans complétés** : Historique
- **Score de risque** : Évaluation globale
- **Nouvelles vulnérabilités** : Découvertes du jour

### Graphiques

- **Tendances** : Évolution des vulnérabilités sur 30 jours
- **Distribution** : Répartition par sévérité (Critical, High, Medium, Low)

### Activité récente

Liste chronologique des événements :
- Lancement de scans
- Découverte de vulnérabilités
- Actions des agents
- Complétion de tâches

---

## Créer un Pentest

### Étape 1 : Cible

1. Cliquez sur **New Pentest** (Nouveau Pentest)
2. Entrez la cible :
   - Domaine (ex: `example.com`)
   - Adresse IP (ex: `192.168.1.1`)
   - Plage d'IP (ex: `192.168.1.0/24`)

### Étape 2 : Scope

Définissez le périmètre du test :

**In Scope** (Autorisé) :
- Sous-domaines spécifiques
- Applications web
- API endpoints

**Out of Scope** (Exclu) :
- Domaines externes
- Services de production
- Zones sensibles

### Étape 3 : Configuration

Sélectionnez le type de pentest :

| Type | Durée estimée | Profondeur |
|------|--------------|------------|
| **Quick** | 15-30 min | Reconnaissance basique |
| **Standard** | 1-2 heures | Scan de vulnérabilités |
| **Comprehensive** | 4-8 heures | Test approfondi |
| **Custom** | Variable | Selon configuration |

**Options avancées** :
- **Deep Thinking** : Augmente la profondeur d'analyse IA
- **Allow Exploitation** : Autorise les tests d'exploitation
- **Stealth Mode** : Réduit la détectabilité
- **OSINT Collection** : Collecte de renseignements ouverts

### Étape 4 : Révision

Vérifiez tous les paramètres avant de lancer :
- Cible et scope
- Configuration
- Provider IA sélectionné

Cliquez sur **Start Pentest** pour démarrer.

---

## Interface de chat

L'interface de chat est le centre de contrôle du pentest en cours.

### Structure

```
┌──────────┬─────────────────────┬──────────┐
│ Sidebar  │    Chat Messages    │  Agents  │
│          │                     │ Findings │
└──────────┴─────────────────────┴──────────┘
```

### Types de messages

- **User** (Utilisateur) : Vos messages et commandes
- **Nia** (Orchestrateur) : Messages de coordination
- **Agent** : Messages des agents spécialisés
- **Thinking** : Raisonnement de l'IA (pliable)
- **Finding** : Découverte de vulnérabilité
- **Terminal** : Résultats d'exécution d'outils

### Actions sur les messages

Cliquez sur le menu d'actions (icône ...) pour :
- **Copy** : Copier le contenu
- **Edit** : Modifier un message
- **Delete** : Supprimer
- **Regenerate** : Régénérer la réponse

### Contrôles de session

Dans l'en-tête :
- **Pause/Resume** : Mettre en pause ou reprendre
- **Analytics** : Voir les métriques détaillées
- **Export** : Exporter la conversation

---

## Export de données

### Export de conversation

Exportez l'historique du chat dans différents formats :

1. Cliquez sur **Export** dans l'en-tête
2. Choisissez le format :
   - **Markdown** (.md) : Format lisible
   - **PDF** : Document professionnel
   - **JSON** : Données brutes
   - **Text** (.txt) : Texte brut
3. Activez/désactivez les timestamps
4. Téléchargez

### Export des findings

Exportez le rapport de vulnérabilités :

1. Cliquez sur **Export Findings**
2. Filtrez par sévérité :
   - Critical
   - High
   - Medium
   - Low
3. Choisissez le format :
   - **Markdown** : Rapport détaillé
   - **PDF** : Rapport professionnel
   - **JSON** : Données structurées
   - **CSV** : Tableau pour Excel
4. Incluez les détails (evidence, remediation)

---

## Configuration des providers

### Ajouter un provider

1. Allez dans **Settings > Providers**
2. Cliquez sur **Add Provider**
3. Remplissez les informations :
   - **Name** : Nom d'affichage
   - **Type** : Anthropic, Zhipu, OpenAI
   - **API Key** : Votre clé API
   - **Base URL** : (Optionnel) Pour endpoints personnalisés

### Gestion des modèles

Par provider, vous pouvez :
- Activer/désactiver des modèles
- Définir le modèle par défaut
- Voir les limites de tokens
- Vérifier l'état de santé

### Provider par défaut

Cliquez sur **Set as Default** pour définir un provider comme défaut pour les nouveaux pentests.

---

## Commandes slash

Tapez `/` dans le chat pour ouvrir le menu des commandes.

### Liste des commandes

| Commande | Description | Exemple |
|----------|-------------|---------|
| `/help` | Affiche l'aide | `/help` |
| `/clear` | Efface l'historique | `/clear` |
| `/scan <target>` | Lance un scan rapide | `/scan example.com` |
| `/pause` | Met en pause le swarm | `/pause` |
| `/resume` | Reprend le swarm | `/resume` |
| `/findings` | Liste les vulnérabilités | `/findings` |
| `/agents` | Liste les agents actifs | `/agents` |
| `/report` | Génère un rapport | `/report` |

### Navigation clavier

- **↑ / ↓** : Naviguer dans les commandes
- **Enter** ou **Tab** : Sélectionner
- **Escape** : Fermer le menu

---

## Gestion des fichiers

### Attacher un fichier

1. Cliquez sur l'icône **Paperclip** dans la barre d'input
2. Sélectionnez le fichier ou faites glisser-déposer
3. Le fichier apparaît comme une "pill" sous l'input

### Types supportés

- **Texte** : .txt, .log, .md
- **Données** : .json, .csv, .xml
- **Réseau** : .nmap, .pcap
- **Config** : .yaml, .yml

### Taille maximale

**10 Mo** par fichier. Les fichiers texte sont automatiquement analysés pour extraction de contenu.

### Retirer un fichier

Cliquez sur la croix (×) sur la "pill" du fichier pour le retirer.

---

## Dépannage

### Problèmes courants

#### Le pentest ne démarre pas

**Vérifications** :
1. Vérifiez que le preflight est passé
2. Assurez-vous qu'un provider est configuré
3. Vérifiez les logs dans le terminal Docker

#### Pas de réponse des agents

**Solutions** :
1. Vérifiez la connexion SSE (indicateur dans l'interface)
2. Rafraîchissez la page
3. Vérifiez l'état du backend dans les logs

#### Erreur de connexion provider

**Vérifications** :
1. Clé API valide et non expirée
2. Quota API disponible
3. Configuration correcte (URL, organisation)

#### Export PDF échoue

**Solutions** :
1. Vérifiez que le navigateur autorise les téléchargements
2. Essayez un format différent (Markdown, JSON)
3. Vérifiez l'espace disque disponible

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `⌘K` ou `Ctrl+K` | Recherche dans le chat |
| `Enter` | Envoyer message |
| `Shift+Enter` | Nouvelle ligne |
| `/` | Ouvrir commandes slash |
| `Escape` | Fermer modal/menu |

### Support

En cas de problème persistant :
1. Consultez les logs Docker : `docker-compose logs -f`
2. Vérifiez l'état des services : `docker-compose ps`
3. Redémarrez les services : `docker-compose restart`

---

## Bonnes pratiques

### Avant un pentest

- Définissez clairement le scope
- Obtenez l'autorisation écrite
- Configurez les notifications
- Vérifiez les règles de l'engagement

### Pendant un pentest

- Surveillez l'activité via le dashboard
- Interagissez avec les agents via le chat
- Documentez les findings importants
- Utilisez les commandes slash pour le contrôle

### Après un pentest

- Exportez les findings en PDF
- Révisez les vulnérabilités
- Planifiez les corrections
- Archivez les données sensibles

---

*Documentation version 1.0 - LEA Platform*
