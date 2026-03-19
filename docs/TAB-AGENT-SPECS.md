# 🤖 ONGLET AGENT - Spécifications Complètes

## Vue d'Ensemble

L'onglet **Agent** est le centre de contrôle des intelligences artificielles qui exécutent les tests de sécurité. C'est l'équivalent d'un "Task Manager" ou "Fleet Management" pour agents IA spécialisés dans le pentest. Inspiré des interfaces comme Kubernetes Dashboard, Ray Cluster, et les outils d'orchestration multi-agents.

---

## 🎯 Objectifs Utilisateur

1. **Visualiser** l'état de tous les agents en temps réel
2. **Contrôler** les agents (assigner tâches, pauser, redémarrer)
3. **Configurer** les comportements et capacités des agents
4. **Analyser** les performances et métriques
5. **Gérer** les outils et plugins disponibles

---

## 📐 Structure de l'Interface

### Layout Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Agent Management                           [+ Add Agent]│
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Total: 8     │  │ Online: 6    │  │ Busy: 4      │          │
│  │              │  │              │  │              │          │
│  │ ◉ 6 Online   │  │ ● Healthy    │  │ 🟢 2 Idle    │          │
│  │ ○ 2 Offline  │  │ ⚠️ 1 Warning │  │ 🔴 4 Active  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  FILTERS: [All ▼] [Status ▼] [Role ▼] [Search...]    [Refresh]  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ AGENT LIST                                                  ││
│  │ ═══════════════════════════════════════════════════════════││
│  │                                                             ││
│  │ ☉ AGENT-01                          ● Online 🟢 Idle        ││
│  │ Role: Reconnaissance Specialist     v2.4.1                  ││
│  │ Uptime: 23h 45m                     [Details] [Configure]   ││
│  │                                                             ││
│  │ ☉ AGENT-02                          ● Online 🔴 Active      ││
│  │ Role: Web Application Scanner       v2.4.1                  ││
│  │ Task: Scanning /api/users           [Details] [Pause]       ││
│  │ Progress: ████████████░░░░ 67%                              ││
│  │                                                             ││
│  │ ☉ AGENT-03                          ● Online 🟡 Updating      ││
│  │ Role: Exploit Developer             v2.4.0 → v2.4.1         ││
│  │ Status: Updating tools...           [Details] [Cancel]      ││
│  │                                                             ││
│  │ ☉ AGENT-04                          ○ Offline ⚫ --          ││
│  │ Role: API Security Tester           v2.3.9                  ││
│  │ Last seen: 2h ago                   [Details] [Restart]     ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Previous] Page 1 of 3 [Next]                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture des Sections

### 1. TABLEAU DE BORD AGENTS (Agent Dashboard)

#### A. Métriques Globales (Cards)

**Total Agents Card**
```
┌─────────────────┐
│ TOTAL AGENTS    │
│                 │
│        8        │
│                 │
│ ◉ 6 Online      │
│ ○ 2 Offline     │
└─────────────────┘
```

**Health Status Card**
```
┌─────────────────┐
│ HEALTH STATUS   │
│                 │
│        6        │
│   /8 Healthy    │
│                 │
│ ● 6 Healthy     │
│ ⚠️ 1 Warning    │
│ ✕ 1 Critical    │
└─────────────────┘
```

**Activity Overview Card**
```
┌─────────────────┐
│ ACTIVITY        │
│                 │
│ 🟢 2 Idle       │
│ 🔴 4 Active     │
│ 🟡 1 Updating   │
│ ⚫ 1 Offline    │
└─────────────────┘
```

#### B. Vue Carte (Grid View)
**Alternative à la liste - Vue carte par agent:**

```
┌─────────────────────┐ ┌─────────────────────┐
│ ☉ AGENT-01     ●    │ │ ☉ AGENT-02     ●    │
│                     │ │                     │
│ 🎯 Reconnaissance   │ │ 🕷️ Web Scanner      │
│                     │ │                     │
│ Status: 🟢 Idle      │ │ Status: 🔴 Active    │
│                     │ │                     │
│ Tasks: 0/5          │ │ Tasks: 1/5          │
│ Uptime: 23h 45m     │ │ Progress: 67%       │
│                     │ │ ████████████░░      │
│ [Details] [Actions▼]│ │ [Details] [Pause]   │
└─────────────────────┘ └─────────────────────┘
```

#### C. Carte Géographique (Optionnel)
- Carte mondiale avec position des agents
- Heat map de l'activité
- Latence par région

---

### 2. DÉTAIL D'UN AGENT (Agent Detail View)

#### Header
```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back to Agents]                                              │
│                                                                 │
│ ☉ AGENT-02                                    [Edit] [Delete]   │
│ Web Application Scanner                     Status: ● Online    │
│                                                            🔴   │
└─────────────────────────────────────────────────────────────────┘
```

#### Onglets

**A. Overview Tab**
```
┌─ Overview ─┬─ Performance ─┬─ Tasks ─┬─ Logs ─┬─ Configuration ─┐

INFORMATION GÉNÉRALE
┌────────────────────────────────────────────────────────────────┐
│ Hostname:       agent-02.internal                              │
│ IP Address:     192.168.1.102                                  │
│ Version:        2.4.1                                          │
│ Role:           Web Application Scanner                        │
│ Status:         ● Online (Last seen: 2s ago)                   │
│ Uptime:         23h 45m 12s                                    │
│ Started:        2026-03-15 14:23:45 UTC                        │
└────────────────────────────────────────────────────────────────┘

RESSOURCES
┌────────────────────────────────────────────────────────────────┐
│ CPU:    [████████████░░░░░░░░] 45%        2.3 GHz / 4 cores   │
│ Memory: [████████████████░░░░] 78%        6.2 GB / 8 GB       │
│ Disk:   [██████░░░░░░░░░░░░░░] 25%        50 GB / 200 GB      │
│ Network: ↓ 45 MB/s  ↑ 12 MB/s                                 │
└────────────────────────────────────────────────────────────────┘

CAPACITÉS
┌────────────────────────────────────────────────────────────────┐
│ Tools Installed:                                               │
│ • Nmap v7.94         • Metasploit Framework v6.3               │
│ • SQLMap v1.7        • Burp Suite Pro v2023.12                 │
│ • Nikto v2.5         • Custom: api-tester v1.2                 │
│                                                                │
│ Skills:                                                        │
│ ✓ SQL Injection      ✓ XSS          ✓ CSRF                     │
│ ✓ Auth Bypass        ✓ IDOR         ✓ API Testing              │
│ ✓ Reconnaissance     ✓ Crawling     ✓ Fuzzing                  │
└────────────────────────────────────────────────────────────────┘
```

**B. Performance Tab**
```
MÉTRIQUES DE PERFORMANCE (24h)

┌─────────────────────────────────────────────────────────────────┐
│ Throughput                                                      │
│ ████████████████████████████████████████████████████  1,234     │
│ Requests/sec                                                    │
├─────────────────────────────────────────────────────────────────┤
│ Success Rate                                                    │
│ ██████████████████████████████████████████████░░░░░░░  94.5%    │
│ Tasks completed successfully                                    │
├─────────────────────────────────────────────────────────────────┤
│ Average Task Duration                                           │
│ ██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  4m 23s   │
│ Per task                                                        │
├─────────────────────────────────────────────────────────────────┤
│ Findings Discovered                                             │
│ ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░  23       │
│ In last 24h                                                     │
└─────────────────────────────────────────────────────────────────┘

GRAPHIQUES
• Line chart: Tasks completed over time
• Bar chart: Findings by severity (agent-specific)
• Pie chart: Tool usage distribution
• Heatmap: Activity by hour of day
```

**C. Tasks Tab**
```
HISTORIQUE DES TÂCHES

┌─────────────────────────────────────────────────────────────────┐
│ Task                    │ Target        │ Status   │ Duration  │
├─────────────────────────────────────────────────────────────────┤
│ Web App Scan            │ example.com   │ ✅ Done  │ 12m 34s   │
│ API Security Test       │ api.example.. │ ✅ Done  │ 8m 12s    │
│ Subdomain Discovery     │ *.example.com │ ✅ Done  │ 3m 45s    │
│ SQL Injection Scan      │ /login        │ 🔴 Failed│ 2m 10s    │
│ XSS Assessment          │ /search       │ ⏸️ Paused│ 5m 23s    │
│ Port Scan               │ 192.168.1.1   │ 🔄 Running│ 6m 45s   │
└─────────────────────────────────────────────────────────────────┘

[Filter: All ▼] [Search...]                      [Export CSV]
```

**D. Logs Tab**
```
LOGS EN TEMPS RÉEL

┌─────────────────────────────────────────────────────────────────┐
│ 2026-03-16 10:23:45 INFO  Starting task: Port Scan            │
│ 2026-03-16 10:23:46 DEBUG Initializing Nmap...                │
│ 2026-03-16 10:23:48 INFO  Scanning ports 1-65535              │
│ 2026-03-16 10:24:12 WARN  High latency detected on target     │
│ 2026-03-16 10:25:01 INFO  Found 12 open ports                 │
│ 2026-03-16 10:25:03 DEBUG Testing service versions...         │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘

[Download Logs] [Filter: All ▼] [Auto-scroll ✓]
```

**E. Configuration Tab**
```
CONFIGURATION

General Settings
┌─────────────────────────────────────────────────────────────────┐
│ Agent Name:        [Agent-02                    ]               │
│ Role:              [Web Application Scanner ▼  ]               │
│ Description:       [Primary web scanning agent  ]               │
│ Tags:              [production, web, critical    ]              │
│ Max Concurrent:    [5 ▼] tasks                                  │
│ Priority:          [High ▼]                                     │
└─────────────────────────────────────────────────────────────────┘

Resource Limits
┌─────────────────────────────────────────────────────────────────┐
│ CPU Limit:         [80% ▼]          Memory Limit: [6GB ▼]       │
│ Disk Limit:        [100GB ▼]        Network:      [Unlimited ▼] │
│ Timeout:           [30m ▼] per task                             │
└─────────────────────────────────────────────────────────────────┘

Advanced
┌─────────────────────────────────────────────────────────────────┐
│ Auto-restart on failure:    [✓] Enabled                         │
│ Notify on task completion:  [✓] Enabled                         │
│ Collect detailed metrics:   [✓] Enabled                         │
│ Debug mode:                 [ ] Disabled                        │
│                                                                 │
│                 [💾 Save Changes]  [🔄 Reset]                   │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. ORCHESTRATION DES TÂCHES (Task Orchestration)

#### Vue Kanban

```
┌─────────────────────────────────────────────────────────────────┐
│ TASK ORCHESTRATION                              [+ New Task]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   QUEUED     │  │ IN PROGRESS  │  │  COMPLETED   │          │
│  │      5       │  │      3       │  │     12       │          │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤          │
│  │ • API Scan   │  │ • Web Scan   │  │ • Recon      │          │
│  │   api.exa... │  │   staging    │  │   3h ago     │          │
│  │   Priority:1 │  │   Agent-02   │  │              │          │
│  │   [Assign ▼] │  │   67%        │  │              │          │
│  │              │  │   ██████░░░  │  │              │          │
│  │ • Port Scan  │  │              │  │ • Auth Test  │          │
│  │   10.0.0.1   │  │ • SQLi Test  │  │   2h ago     │          │
│  │   Priority:2 │  │   prod-api   │  │              │          │
│  │   [Assign ▼] │  │   Agent-03   │  │ • XSS Scan   │          │
│  │              │  │   45%        │  │   1h ago     │          │
│  │              │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │    PAUSED    │  │    FAILED    │                            │
│  │      1       │  │      2       │                            │
│  ├──────────────┤  ├──────────────┤                            │
│  │ • XSS Assess │  │ • Brute Forc │                            │
│  │   /search    │  │   /admin     │                            │
│  │   Agent-04   │  │   Timeout    │                            │
│  │   [Resume]   │  │   [Retry]    │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Création de Tâche

```
┌─────────────────────────────────────────────────────────────────┐
│ NEW TASK                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Task Name:        [Port Scan - Production                    ] │
│                                                                 │
│ Target:           [10.0.0.0/24                               ] │
│                   [✓] Valid CIDR notation                      │
│                                                                 │
│ Task Type:        [Network Scan ▼]                              │
│                   • Network Scan                                │
│                   • Web Application Scan                        │
│                   • API Security Test                           │
│                   • Reconnaissance                              │
│                   • Exploitation                                │
│                   • Custom Script                               │
│                                                                 │
│ Assign to:        [Auto-assign ▼]                               │
│                   • Auto-assign (best available)                │
│                   • Agent-01 (Recon)                            │
│                   • Agent-02 (Web)                              │
│                   • Agent-03 (Exploit)                          │
│                   • Multiple agents...                          │
│                                                                 │
│ Priority:         [High ▼]     [1 - 5]                          │
│                                                                 │
│ Schedule:         [◉ Run immediately]                           │
│                   [○ Schedule for later]                        │
│                                                                 │
│ Advanced Options: [▼ Expand]                                    │
│                                                                 │
│            [Cancel]                              [Create Task] │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. GESTION DES OUTILS (Tool Management)

#### Inventaire des Outils

```
┌─────────────────────────────────────────────────────────────────┐
│ TOOLS INVENTORY                                  [+ Install New]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Search tools...] [Filter: All ▼] [Sort: Name ▼]                │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Nmap                                                        │ │
│ │ Network Scanner                                  [✓] Installed│ │
│ │                                                             │ │
│ │ Version: 7.94        Status: ✓ Up to date                   │ │
│ │ Category: Network    Agents: 6/8                            │ │
│ │                                                             │ │
│ │ Description: Advanced port scanner and network discovery    │ │
│ │                                                             │ │
│ │ [Configure] [Update] [Uninstall]                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Metasploit Framework                                        │ │
│ │ Exploitation Platform                            [✓] Installed│ │
│ │                                                             │ │
│ │ Version: 6.3.0       Status: ⚠️ Update available (6.3.1)    │ │
│ │ Category: Exploit    Agents: 4/8                            │ │
│ │                                                             │ │
│ │ [Configure] [Update] [Uninstall]                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Custom: api-tester                                          │ │
│ │ Custom API Testing Tool                          [✓] Installed│ │
│ │                                                             │ │
│ │ Version: 1.2.0       Status: ✓ Up to date                   │ │
│ │ Category: Custom     Agents: 2/8                            │ │
│ │                                                             │ │
│ │ [Configure] [Update] [Uninstall] [Edit Script]              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Nessus                                                      │ │
│ │ Vulnerability Scanner                            [✗] Not Inst│ │
│ │                                                             │ │
│ │ [Install]                                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Installation d'Outil

```
┌─────────────────────────────────────────────────────────────────┐
│ INSTALL TOOL                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Tool Name:        [Nessus                                    ] │
│                                                                 │
│ Source:           [◉ Official Repository]                       │
│                   [○ Custom URL]                                │
│                   [○ Upload Package]                            │
│                                                                 │
│ Version:          [Latest Stable ▼]                             │
│                   • Latest Stable (10.7.0)                      │
│                   • Latest Beta (10.8.0-beta)                   │
│                   • Specific version...                         │
│                                                                 │
│ Install on:       [All Agents ▼]                                │
│                   • All Agents                                  │
│                   • Selected Agents...                          │
│                   • New agents only                             │
│                                                                 │
│ Configuration:    [▼ Default Settings]                           │
│                                                                 │
│ License Key:      [••••••••••••••••••••••                  ] │
│                                                                 │
│            [Cancel]                              [Install]      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

### Couleurs des Rôles
```css
/* Agent Roles */
--role-recon: #3B82F6;        /* Blue - Reconnaissance */
--role-web: #8B5CF6;          /* Purple - Web Scanner */
--role-api: #10B981;          /* Green - API Tester */
--role-exploit: #EF4444;      /* Red - Exploit Developer */
--role-network: #F59E0B;      /* Amber - Network Specialist */
--role-forensics: #EC4899;    /* Pink - Forensics */
```

### Couleurs de Statut
```css
/* Agent Status */
--status-online: #10B981;     /* Green */
--status-offline: #6B7280;    /* Gray */
--status-busy: #EF4444;       /* Red */
--status-idle: #3B82F6;       /* Blue */
--status-updating: #F59E0B;   /* Amber */
--status-error: #DC2626;      /* Dark Red */
```

### Icônes
- **Agent:** ☉ ou 🤖
- **Online:** ● (green dot)
- **Offline:** ○ (gray dot)
- **Busy:** 🔴 ou ⚙️
- **Idle:** 🟢
- **Warning:** ⚠️
- **Error:** ✕ ou 🚨
- **Task:** 📋
- **Tool:** 🛠️
- **Log:** 📄
- **Settings:** ⚙️

---

## ⚡ Interactions

### Temps Réel
- **Heartbeat:** Ping toutes les 10 secondes
- **Status updates:** SSE pour changements de statut
- **Progress bars:** Mise à jour temps réel des tâches
- **Resource graphs:** Métriques rafraîchies toutes les 5s

### Actions en Masse
- Sélection multiple d'agents (checkbox)
- Actions groupées:
  - [Restart Selected]
  - [Update Selected]
  - [Pause Tasks]
  - [Delete]

### Drag & Drop
- Réorganisation du Kanban
- Assignation de tâches (drag vers agent)
- Priorisation (drag dans colonne Queued)

---

## 🔧 Fonctionnalités Avancées

### 1. Auto-Scaling
```
┌─────────────────────────────────────────────────────────────────┐
│ AUTO-SCALING CONFIGURATION                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Mode:             [◉ Manual] [○ Auto-scale]                     │
│                                                                 │
│ Auto-scale Rules:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ IF Queue depth > 10 tasks    THEN Spawn 1 new agent        │ │
│ │ IF Avg wait time > 5 min     THEN Spawn 2 new agents       │ │
│ │ IF CPU usage < 20% for 1h    THEN Terminate 1 idle agent   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Min Agents:       [2]          Max Agents: [20]                 │
│                                                                 │
│                   [💾 Save Configuration]                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Health Checks
```
┌─────────────────────────────────────────────────────────────────┐
│ HEALTH CHECKS                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Check Interval:   [30s ▼]                                       │
│ Timeout:          [10s ▼]                                       │
│ Retries:          [3 ▼]                                         │
│                                                                 │
│ Checks:                                                         │
│ [✓] HTTP endpoint reachable                                     │
│ [✓] Disk space > 10%                                            │
│ [✓] Memory usage < 90%                                          │
│ [✓] Can reach target network                                    │
│ [✓] API key valid                                               │
│                                                                 │
│ On Failure:       [Restart Agent ▼]                             │
│ Notify:           [✓] Email admin                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Alertes
- **Agent offline** > 5 minutes
- **Task failed** après retries
- **High resource usage** > 90% pendant > 5min
- **Tool crash** ou erreur critique
- **New version available** pour outils

---

## 📊 Métriques & KPIs

### Métriques par Agent
- Tasks completed / hour
- Success rate (%)
- Average task duration
- Findings discovered
- Resource efficiency

### Métriques Globales
- Agent utilization rate
- Queue depth (moyenne)
- Mean time to assign (MTTA)
- Task throughput
- Fleet availability (%)

### Tableaux de Bord
- **Agent Performance Leaderboard**
- **Resource Utilization Heatmap**
- **Task Completion Trends**
- **Error Rate by Agent**

---

## ✅ Checklist d'Implémentation

### Phase 1: Base (Sprint 1)
- [ ] Liste des agents avec statut
- [ ] Cards de métriques globales
- [ ] Filtrage et recherche
- [ ] Vue détail basique (Overview)

### Phase 2: Contrôle (Sprint 2)
- [ ] Actions pause/restart/delete
- [ ] Vue Kanban (Task Orchestration)
- [ ] Création/assignation de tâches
- [ ] Logs en temps réel

### Phase 3: Configuration (Sprint 3)
- [ ] Configuration agent (Settings tab)
- [ ] Gestion des outils (install/update)
- [ ] Resource limits
- [ ] Health checks

### Phase 4: Avancé (Sprint 4)
- [ ] Performance metrics et graphs
- [ ] Auto-scaling rules
- [ ] Alertes et notifications
- [ ] Bulk actions

---

## 🔗 API Endpoints

```typescript
// Agents
GET    /api/agents                      // Liste des agents
GET    /api/agents/:id                  // Détail d'un agent
POST   /api/agents                      // Créer un agent
PUT    /api/agents/:id                  // Modifier un agent
DELETE /api/agents/:id                  // Supprimer un agent
POST   /api/agents/:id/pause            // Mettre en pause
POST   /api/agents/:id/resume           // Reprendre
POST   /api/agents/:id/restart          // Redémarrer
GET    /api/agents/:id/logs             // Logs
GET    /api/agents/:id/metrics          // Métriques

// Tasks
GET    /api/tasks                       // Liste des tâches
POST   /api/tasks                       // Créer une tâche
GET    /api/tasks/:id                   // Détail d'une tâche
PUT    /api/tasks/:id                   // Modifier
DELETE /api/tasks/:id                   // Supprimer
POST   /api/tasks/:id/assign            // Assigner à un agent
POST   /api/tasks/:id/pause             // Pause
POST   /api/tasks/:id/resume            // Resume
POST   /api/tasks/:id/cancel            // Annuler

// Tools
GET    /api/tools                       // Inventaire
POST   /api/tools/install               // Installer
POST   /api/tools/:id/update            // Mettre à jour
DELETE /api/tools/:id                   // Désinstaller
```

---

## 📚 Références

- **Kubernetes Dashboard** - Gestion de clusters
- **Ray** - Distributed computing framework
- **Prefect** - Workflow orchestration
- **Nomad** - Workload orchestration

---

**Version:** 1.0  
**Date:** Mars 2026  
**Auteur:** Claude Code  
**Statut:** Prêt pour implémentation
