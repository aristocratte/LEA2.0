# Analyse Fonctionnelle — Onglet Report LEA/EASM AI Platform

> **Version** : 1.0.0
> **Date** : Février 2025
> **Portée** : Analyse fonctionnelle exhaustive de l'onglet Report

---

## 1. Vue d'Ensemble

L'onglet Report permet de consulter, gérer et exporter les rapports de tests d'intrusion générés par l'agent IA. Il constitue l'interface de restitution des résultats pour les utilisateurs finaux et les parties prenantes.

### 1.1 État Actuel

| Aspect | Statut | Commentaire |
|--------|--------|-------------|
| Spécifications | ✅ Complètes | Documents détaillés existants |
| Implémentation Frontend | ❌ Non démarrée | Scaffold uniquement |
| Implémentation Backend | ❌ Non démarrée | Endpoints non créés |
| Génération PDF/HTML | 📋 Planifiée | via docx + conversion |

---

## 2. Architecture Fonctionnelle

### 2.1 Flux Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW REPORT                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐   │
│  │  LIST    │───▶│  DETAIL   │───▶│  EXPORT   │───▶│ DOWNLOAD │   │
│  │  View    │    │   View    │    │   Options │    │   File   │   │
│  └──────────┘    └───────────┘    └───────────┘    └──────────┘   │
│       │               │                 │                           │
│       ▼               ▼                 ▼                           │
│  [Liste des       [Vue détaillée    [Format PDF    [Fichier       │
│   rapports]        des findings]     ou HTML]       généré]       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Sources de Données

| Source | Description | Fiabilité |
|--------|-------------|-----------|
| Base de données | Données persistées après chaque pentest | Source de vérité |
| State React | Données en mémoire du pentest actif | Volatile |
| Cache | Données mises en cache pour performance | Secondaire |

---

## 3. Fonctionnalités Détaillées

### 3.1 Liste des Rapports (ReportList)

#### 3.1.1 Affichage Principal

**Fonction** : Présenter tous les rapports de pentest disponibles.

**Colonnes affichées** :

| Colonne | Description | Tri |
|---------|-------------|-----|
| ID | Identifiant unique du rapport | - |
| Target | Cible du pentest | ✅ |
| Status | Statut du rapport (draft, complete) | ✅ |
| Created | Date de création | ✅ |
| Findings | Nombre de findings par sévérité | - |
| Duration | Durée du pentest | - |
| Actions | Boutons d'action | - |

#### 3.1.2 Filtres et Recherche

**Filtres disponibles** :
- Par statut : `draft`, `complete`, `archived`
- Par sévérité : `Critical`, `High`, `Medium`, `Low`, `Info`
- Par date : Plage de dates personnalisée
- Par cible : Recherche textuelle

#### 3.1.3 Actions Rapides

| Action | Description |
|--------|-------------|
| Voir | Ouvrir la vue détaillée |
| Export PDF | Télécharger en PDF |
| Export HTML | Télécharger en HTML |
| Supprimer | Supprimer le rapport |
| Archiver | Archiver le rapport |

### 3.2 Vue Détaillée (ReportDetail)

#### 3.2.1 Structure du Rapport

**Sections standards** :

```
┌─────────────────────────────────────────────────────────────────────┐
│ RAPPORT DE TEST D'INTRUSION                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 1. RÉSUMÉ EXÉCUTIF                                                  │
│    - Contexte de la mission                                         │
│    - Périmètre testé                                                │
│    - Synthèse des résultats                                         │
│    - Recommandations prioritaires                                   │
│                                                                     │
│ 2. INFORMATIONS GÉNÉRALES                                           │
│    - Objectifs                                                      │
│    - Méthodologie                                                   │
│    - Outils utilisés                                                │
│    - Durée et timing                                                │
│                                                                     │
│ 3. SYNTHÈSE DES VULNÉRABILITÉS                                      │
│    - Tableau récapitulatif                                          │
│    - Graphique de répartition par sévérité                          │
│    - Graphique de répartition par catégorie                         │
│                                                                     │
│ 4. VULNÉRABILITÉS DÉTAILLÉES                                        │
│    - Findings Critical                                              │
│    - Findings High                                                  │
│    - Findings Medium                                                │
│    - Findings Low                                                   │
│    - Findings Informational                                         │
│                                                                     │
│ 5. ANNEXES                                                          │
│    - Logs d'exécution                                               │
│    - Outputs des outils                                             │
│    - Références et CVE                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Fiche Finding

**Structure d'un finding détaillé** :

```
┌─────────────────────────────────────────────────────────────────────┐
│ [CRITICAL] SQL Injection dans le formulaire de login                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Catégorie: Injection                                                │
│ CVSS Score: 9.8 (Critical)                                          │
│ CVE: CVE-2021-XXXXX                                                 │
│                                                                     │
│ Description:                                                         │
│ Le paramètre "username" du formulaire de login est vulnérable       │
│ à une injection SQL de type boolean-based blind. L'attaquant        │
│ peut extraire la base de données complète sans authentification.   │
│                                                                     │
│ Evidence:                                                            │
│ Payload: admin' AND 1=1--                                           │
│ Response: HTTP 200 (login successful)                               │
│ Payload: admin' AND 1=2--                                           │
│ Response: HTTP 401 (invalid credentials)                            │
│                                                                     │
│ Impact:                                                              │
│ - Exfiltration de données sensibles                                 │
│ - Contournement d'authentification                                  │
│ - Exécution de commande système (si droits suffisants)              │
│                                                                     │
│ Remédiation:                                                         │
│ 1. Utiliser des requêtes paramétrées (prepared statements)         │
│ 2. Valider et sanitiser toutes les entrées utilisateur            │
│ 3. Implémenter un WAF avec règles anti-SQL injection               │
│                                                                     │
│ Références:                                                          │
│ - OWASP: https://owasp.org/...                                      │
│ - CWE-89: SQL Injection                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.2.3 Visualisations

**Graphiques inclus** :

| Graphique | Type | Données |
|-----------|------|---------|
| Répartition sévérité | Pie chart | Count par severity |
| Répartition catégorie | Bar chart | Count par category |
| Timeline du pentest | Timeline | Phases et duration |
| Heatmap des ports | Heatmap | Ports ouverts par host |

### 3.3 Export de Rapport

#### 3.3.1 Formats Disponibles

| Format | Description | Use Case |
|--------|-------------|----------|
| PDF | Document formaté pour impression | Partage formel, archivage |
| HTML | Page web interactive | Partage en ligne, navigation |
| JSON | Données structurées | Intégration, API |
| Markdown | Format texte brut | Documentation technique |

#### 3.3.2 Options d'Export

**Options PDF** :
- [ ] Inclure les annexes complètes
- [ ] Inclure les outputs d'outils
- [ ] Inclure les captures d'écran
- [ ] Format A4 ou Letter
- [ ] Orientation portrait ou paysage
- [ ] Marquage confidentiel

**Options HTML** :
- [ ] Style interactif (accordéons)
- [ ] Charts animés
- [ ] Recherche intégrée
- [ ] Navigation latérale

#### 3.3.3 Templates Personnalisés

**Fonction** : Permettre de personnaliser le format du rapport.

**Templates disponibles** :
| Template | Description |
|----------|-------------|
| Standard | Format par défaut, complet |
| Executive | Résumé court pour direction |
| Technical | Détails techniques complets |
| Compliance | Aligné normes (PCI-DSS, ISO 27001) |

### 3.4 Gestion des Versions

#### 3.4.1 Historique des Modifications

**Fonction** : Tracer les changements apportés au rapport.

**Événements tracés** :
- Création initiale
- Ajout/suppression de findings
- Modification de sévérité
- Changement de statut (draft → complete)
- Export

#### 3.4.2 Collaboration

**Fonction** : Permettre plusieurs personnes de collaborer sur un rapport.

**Rôles** :
| Rôle | Permissions |
|------|-------------|
| Owner | Toutes les actions |
| Editor | Modifier le contenu |
| Reviewer | Commenter, suggérer |
| Viewer | Consulter uniquement |

---

## 4. Modèle de Données

### 4.1 Entité Report

```typescript
interface Report {
  id: string;
  pentest_id: string;
  
  // Métadonnées
  title: string;
  target: string;
  status: 'draft' | 'complete' | 'archived';
  
  // Dates
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  
  // Contenu
  executive_summary: string;
  methodology: string;
  scope: string;
  
  // Relations
  findings: Finding[];
  phases: PhaseInfo[];
  tools_used: ToolUsage[];
  
  // Statistiques
  stats: {
    total_findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    duration_minutes: number;
    tokens_used: number;
  };
  
  // Configuration export
  export_config?: {
    template: string;
    include_annexes: boolean;
    include_tools_output: boolean;
    confidential: boolean;
  };
}
```

### 4.2 Entité Finding

```typescript
interface Finding {
  id: string;
  report_id: string;
  pentest_id: string;
  
  // Identification
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  category: string;
  cvss_score?: number;
  cvss_vector?: string;
  cve_id?: string;
  cwe_id?: string;
  
  // Contenu
  description: string;
  evidence: string;
  impact: string;
  remediation: string;
  
  // Références
  references: string[];
  
  // Métadonnées
  phase_name: string;
  tool_used?: string;
  discovered_at: Date;
  
  // Status
  status: 'open' | 'confirmed' | 'false_positive' | 'fixed';
  verified: boolean;
}
```

---

## 5. Points d'API Requis

### 5.1 Endpoints REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/reports` | Liste des rapports |
| POST | `/api/reports` | Créer un rapport |
| GET | `/api/reports/:id` | Détails d'un rapport |
| PUT | `/api/reports/:id` | Modifier un rapport |
| DELETE | `/api/reports/:id` | Supprimer un rapport |
| GET | `/api/reports/:id/export/pdf` | Export PDF |
| GET | `/api/reports/:id/export/html` | Export HTML |
| GET | `/api/reports/:id/export/json` | Export JSON |
| PATCH | `/api/reports/:id/status` | Changer le statut |
| GET | `/api/reports/:id/findings` | Findings du rapport |
| PATCH | `/api/reports/:id/findings/:fid` | Modifier un finding |

### 5.2 Endpoints Templates

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/reports/templates` | Liste des templates |
| POST | `/api/reports/templates` | Créer un template |
| GET | `/api/reports/templates/:id` | Détails d'un template |
| PUT | `/api/reports/templates/:id` | Modifier un template |

---

## 6. Problèmes Critiques

### 6.1 Pipeline de Données

**Problème** :

> ⚠️ **REPORT-001** : Les rapports sont vides après navigation depuis CompletedScreen.

**Cause** : Les findings ne sont pas persistés en base de données pendant le pentest. Le CompletedScreen affiche les données du state React local, mais ReportDetail fetch depuis la DB.

**Solution** :
1. Implémenter la persistence des findings dans l'orchestrateur
2. Synchroniser le state React avec la DB en temps réel
3. Utiliser TanStack Query pour la gestion du cache

### 6.2 Génération PDF

**Problème** :

> ⚠️ **REPORT-002** : La génération de PDF n'est pas implémentée.

**Solution** : Utiliser la bibliothèque `docx` pour générer un document Word, puis convertir en PDF (via `libreoffice` headless ou service externe).

---

## 7. Références et Inspirations

### 7.1 Standards de Rapports

| Standard | Description |
|----------|-------------|
| OWASP Top 10 | Catégorisation des vulnérabilités web |
| PTES | Penetration Testing Execution Standard |
| OSSTMM | Open Source Security Testing Methodology |
| NIST SP 800-115 | Technical Guide to Information Security Testing |

### 7.2 Outils de Génération

| Outil | Usage |
|-------|-------|
| docx | Génération de documents Word |
| puppeteer | Génération de PDF depuis HTML |
| Recharts | Graphiques pour version HTML |
| Mustache/Handlebars | Templates de rapports |

---

## 8. Roadmap d'Implémentation

### Phase 1 : MVP (1 semaine)
- [ ] Liste des rapports basique
- [ ] Vue détaillée avec findings
- [ ] Export basique (JSON)

### Phase 2 : Export (1 semaine)
- [ ] Génération PDF
- [ ] Génération HTML
- [ ] Templates de base

### Phase 3 : Avancé (2 semaines)
- [ ] Filtres et recherche
- [ ] Collaboration multi-utilisateur
- [ ] Historique des versions
- [ ] Templates personnalisables

---

**Fin de l'analyse fonctionnelle — Onglet Report**
