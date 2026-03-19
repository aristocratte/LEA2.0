# 🐛 ONGLET FINDINGS - Spécifications Complètes

## Vue d'Ensemble

L'onglet **Findings** est le centre de gestion des vulnérabilités découvertes. C'est l'équivalent d'un "Bug Tracker" ou "Vulnerability Management Platform" spécialisé pour le pentest. Inspiré de Jira, Tenable.io, Qualys VMDR, et DefectDojo.

---

## 🎯 Objectifs Utilisateur

1. **Visualiser** toutes les vulnérabilités découvertes
2. **Trier et filtrer** par sévérité, statut, type, asset
3. **Examiner** les détails avec preuves et reproduction
4. **Assigner** pour remédiation
5. **Suivre** l'état de correction
6. **Générer** des rapports

---

## 📐 Structure de l'Interface

### Layout Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Findings (68 total)                         [Export ▼] │
├─────────────────────────────────────────────────────────────────┤
│  FILTRES AVANCÉS                                               │
│  [Severity: All ▼] [Status: All ▼] [Asset: All ▼] [Type ▼] 🔍  │
│  [Date: Last 30 days ▼] [CVSS: All ▼] [Assignee: All ▼]        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  RÉSUMÉ                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ 🔴 3     │ │ 🟠 12    │ │ 🟡 45    │ │ 🔵 8     │           │
│  │ Critical │ │ High     │ │ Medium   │ │ Low      │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ACTIONS DE MASSE: [✓ Select All] [Assign ▼] [Status ▼] [Tag ▼]│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ FINDINGS LIST                                               ││
│  │ ═══════════════════════════════════════════════════════════││
│  │                                                             ││
│  │ [✓] ▼ 🔴 SQL Injection in login endpoint                    ││
│  │     api.example.com/auth/login | CVSS: 9.8 | EPSS: 0.42     ││
│  │     CWE-89 | Status: Confirmed | Assigned: John Doe         ││
│  │     [Details] [Assign] [Create Ticket] [Mark FP]            ││
│  │                                                             ││
│  │ [ ] ▶ 🟠 XSS Reflected in search parameter                  ││
│  │     blog.example.com/search | CVSS: 6.1 | EPSS: 0.12        ││
│  │     CWE-79 | Status: New | Assigned: Unassigned             ││
│  │                                                             ││
│  │ [ ] ▶ 🟡 Information Disclosure - Stack Trace               ││
│  │     app.example.com/error | CVSS: 4.3 | EPSS: 0.05          ││
│  │     CWE-209 | Status: In Progress | Assigned: Jane Smith    ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  [Previous] Page 1 of 5 [Next]        Showing 1-20 of 68       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture des Sections

### 1. TABLEAU DE BORD FINDINGS

#### A. Résumé Visuel (Cards)

```
┌─────────────────────────────────────────────────────────────────┐
│ FINDINGS OVERVIEW                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   CRITICAL   │  │     HIGH     │  │    MEDIUM    │          │
│  │              │  │              │  │              │          │
│  │      3       │  │     12       │  │     45       │          │
│  │              │  │              │  │              │          │
│  │ 🔴 1 New     │  │ 🟠 3 New     │  │ 🟡 8 New     │          │
│  │ 🔴 2 Conf.   │  │ 🟠 5 Conf.   │  │ 🟡 25 Conf.  │          │
│  │ 🔴 0 Fixed   │  │ 🟠 4 Fixed   │  │ 🟡 12 Fixed  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     LOW      │  │     INFO     │  │  AVG SEVERITY│          │
│  │              │  │              │  │              │          │
│  │      8       │  │     23       │  │     5.2      │          │
│  │              │  │              │  │    /10       │          │
│  │ 🔵 2 New     │  │ ⚪ 5 New     │  │              │          │
│  │ 🔵 4 Conf.   │  │ ⚪ 12 Conf.  │  │ Trend: ↓     │          │
│  │ 🔵 2 Fixed   │  │ ⚪ 6 Fixed   │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Trends & Analytics

```
┌─────────────────────────────────────────────────────────────────┐
│ TRENDS (Last 30 Days)                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  New vs Fixed                                                   │
│  ████████████████████░░░░░░░░░░░░░░  New: 23                   │
│  ██████████████░░░░░░░░░░░░░░░░░░░░  Fixed: 18                 │
│                                                                  │
│  By Category                                                    │
│  Injection      ████████████████████  45%                       │
│  XSS            ██████████████░░░░░░  30%                       │
│  Auth           ████████░░░░░░░░░░░░  20%                       │
│  Config         ██░░░░░░░░░░░░░░░░░░  5%                        │
│                                                                  │
│  Mean Time To Remediate (MTTR)                                  │
│  Critical: 3.2 days | High: 7.5 days | Medium: 14.2 days       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### C. Top Assets at Risk

```
ASSETS BY RISK SCORE
┌─────────────────────────────────────────────────────────────────┐
│ Asset               │ Findings │ Risk Score │ Last Scan        │
├─────────────────────────────────────────────────────────────────┤
│ api.example.com     │    23    │    847     │ 2h ago           │
│ admin.example.com   │    12    │    723     │ 5h ago           │
│ blog.example.com    │     8    │    534     │ 1d ago           │
│ shop.example.com    │     6    │    421     │ 2d ago           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. LISTE DES FINDINGS

#### A. Vue Table (Défaut)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [✓] | Severity | Finding                    | Asset          | Status     | Age │
├────────────────────────────────────────────────────────────────────────────────┤
│ [✓] │ 🔴 9.8   │ SQL Injection in /login     │ api.example... │ Confirmed  │ 2d  │
│ [ ] │ 🟠 7.5   │ XSS in search               │ blog.exampl... │ New        │ 5h  │
│ [ ] │ 🟠 6.8   │ IDOR in /api/users          │ api.example... │ In Prog.   │ 1d  │
│ [ ] │ 🟡 5.3   │ Information Disclosure      │ app.exampl...  │ Fixed      │ 3d  │
│ [ ] │ 🔵 3.2   │ Missing Security Headers    │ www.exampl...  │ Accepted   │ 1w  │
└────────────────────────────────────────────────────────────────────────────────┘

[Actions: Assign to ▼] [Change Status ▼] [Add Tag ▼] [Export Selected ▼]
```

**Colonnes Configurables:**
- Severity (avec CVSS score)
- Finding Title
- Asset/Target
- Status
- Category/CWE
- Assigned To
- Date Discovered
- Age
- EPSS Score
- Due Date

#### B. Vue Carte (Card View)

```
┌────────────────────────────┐ ┌────────────────────────────┐
│ 🔴 CRITICAL                │ │ 🟠 HIGH                    │
│                            │ │                            │
│ SQL Injection              │ │ XSS Reflected              │
│ CWE-89                     │ │ CWE-79                     │
│                            │ │                            │
│ CVSS: 9.8                  │ │ CVSS: 7.5                  │
│ EPSS: 0.42                 │ │ EPSS: 0.12                 │
│                            │ │                            │
│ api.example.com            │ │ blog.example.com           │
│ /auth/login                │ │ /search                    │
│                            │ │                            │
│ Status: Confirmed          │ │ Status: New                │
│ Assigned: John Doe         │ │ Assigned: --               │
│                            │ │                            │
│ [Details] [Assign]         │ │ [Details] [Assign]         │
└────────────────────────────┘ └────────────────────────────┘
```

#### C. Vue Kanban (By Status)

```
KANBAN VIEW
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│     NEW     │ │  CONFIRMED  │ │ IN PROGRESS │ │    FIXED    │
│     15      │ │     32      │ │     12      │ │      9      │
├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│ 🔴 SQLi     │ │ 🔴 SQLi     │ │ 🟠 XSS      │ │ 🟡 Info     │
│   api/login │ │   prod/api  │ │   blog      │ │   stack     │
│ 🟠 XSS      │ │ 🟠 IDOR     │ │ 🟡 Config   │ │ 🟢 Header   │
│   search    │ │   /users    │ │   cors      │ │   HSTS      │
│ 🟡 Info     │ │ 🟡 Path     │ │             │ │             │
│   trace     │ │   trav      │ │             │ │             │
│             │ │             │ │             │ │             │
│ [+ Add FP]  │ │             │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

┌─────────────┐ ┌─────────────┐
│ FALSE POS.  │ │   CLOSED    │
│     3       │ │      8      │
├─────────────┤ ├─────────────┤
│ ⚪ Scanner  │ │ ⚪ Accepted │
│   issue     │ │   risk      │
│ ⚪ Network  │ │ ⚪ Out of   │
│   error     │ │   scope     │
└─────────────┘ └─────────────┘
```

---

### 3. DÉTAIL D'UNE VULNÉRABILITÉ (Finding Detail)

#### Header

```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back to Findings]                                    [Edit ▼]│
│                                                                  │
│ 🔴 SQL Injection in Login Endpoint                                │
│                                                                  │
│ Tags: [injection] [auth] [critical] [verified]         [+ Add]  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Overview │ Evidence │ Remediation │ History │ Comments          │
└─────────────────────────────────────────────────────────────────┘
```

#### A. Overview Tab

```
SCORING
┌─────────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   CVSS v3.1     │  │      EPSS       │  │  CUSTOM SCORE   │ │
│  │                 │  │                 │  │                 │ │
│  │      9.8        │  │     0.42        │  │      847        │ │
│  │   CRITICAL      │  │  42% chance     │  │   CRITICAL      │ │
│  │                 │  │  of exploit     │  │                 │ │
│  │ [Calculator ▼]  │  │  in 30 days     │  │  [Adjust ▼]     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  Vector: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H          │
└─────────────────────────────────────────────────────────────────┘

CLASSIFICATION
┌─────────────────────────────────────────────────────────────────┐
│ CWE:              CWE-89 - SQL Injection                        │
│ Category:         Injection                                     │
│ OWASP Top 10:     A03:2021 - Injection                          │
│ WASC:             WASC-19 - SQL Injection                       │
│                                                                  │
│ Compliance Mapping:                                              │
│ • PCI-DSS: 6.5.1 - Injection flaws                              │
│ • OWASP ASVS: V5.3 - Output Encoding                            │
│ • NIST 800-53: SI-10 - Information Input Validation             │
└─────────────────────────────────────────────────────────────────┘

ASSET INFORMATION
┌─────────────────────────────────────────────────────────────────┐
│ Target:           api.example.com                               │
│ Endpoint:         /auth/login                                   │
│ Parameter:        username (POST body)                          │
│ Technology:       Node.js 18.2, Express 4.18, PostgreSQL 14     │
│                                                                  │
│ First Seen:       2026-03-14 10:23:45 UTC                       │
│ Last Seen:        2026-03-16 14:12:33 UTC (still present)       │
│ Scan ID:          #12345                                        │
└─────────────────────────────────────────────────────────────────┘

METADATA
┌─────────────────────────────────────────────────────────────────┐
│ Assigned to:      John Doe (john.doe@company.com)              │
│ Due Date:         2026-03-21 (5 days remaining)                │
│ Status:           Confirmed → In Progress                      │
│                                                                  │
│ Ticket:           JIRA-1234  [Open in Jira →]                  │
│ PR/MR:            !567  [View on GitLab →]                      │
│                                                                  │
│ Verification:     Pending re-scan after fix                     │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Evidence Tab

```
DESCRIPTION
┌─────────────────────────────────────────────────────────────────┐
│ The login endpoint at /auth/login is vulnerable to SQL          │
│ injection via the 'username' parameter. The application         │
│ constructs SQL queries using string concatenation without       │
│ proper parameterization or input validation.                    │
│                                                                  │
│ An attacker can bypass authentication and extract sensitive     │
│ data from the database by injecting malicious SQL payloads.     │
└─────────────────────────────────────────────────────────────────┘

IMPACT
┌─────────────────────────────────────────────────────────────────┐
│ • Authentication bypass - attackers can log in as any user      │
│ • Data exfiltration - full database access possible            │
│ • Data modification - ability to alter or delete records       │
│ • Privilege escalation - potential for admin access            │
└─────────────────────────────────────────────────────────────────┘

PROOF OF CONCEPT
┌─────────────────────────────────────────────────────────────────┐
│ REQUEST:                                                        │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ POST /auth/login HTTP/1.1                                   │ │
│ │ Host: api.example.com                                       │ │
│ │ Content-Type: application/json                              │ │
│ │                                                             │ │
│ │ {                                                           │ │
│ │   "username": "admin' OR '1'='1'--",                        │ │
│ │   "password": "anything"                                    │ │
│ │ }                                                           │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ RESPONSE:                                                       │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ HTTP/1.1 200 OK                                             │ │
│ │ Content-Type: application/json                              │ │
│ │                                                             │ │
│ │ {                                                           │ │
│ │   "status": "success",                                      │ │
│ │   "token": "eyJhbGciOiJIUzI1NiIs...",                      │ │
│ │   "user": {                                                 │ │
│ │     "id": 1,                                                │ │
│ │     "username": "admin",                                    │ │
│ │     "role": "administrator"                                 │ │
│ │   }                                                         │ │
│ │ }                                                           │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [📋 Copy as cURL] [📄 Export to Burp] [🔍 Send to Repeater]     │
└─────────────────────────────────────────────────────────────────┘

SCREENSHOTS
┌─────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 📷 Screenshot 1: Login bypass successful                   │ │
│ │                                                            │ │
│ │ [Image showing admin panel access]                         │ │
│ │                                                            │ │
│ │ Taken: 2026-03-14 10:24:12 UTC                             │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [+ Add Screenshot]                                              │
└─────────────────────────────────────────────────────────────────┘

ADDITIONAL EVIDENCE
┌─────────────────────────────────────────────────────────────────┐
│ • Database schema extracted (users, passwords, orders tables)  │
│ • 1,243 user records accessible                                │
│ • Admin password hashes obtained (bcrypt $2b$10$...)           │
│                                                                  │
│ [📁 Download Evidence Package (12.4 MB)]                        │
└─────────────────────────────────────────────────────────────────┘
```

#### C. Remediation Tab

```
RECOMMENDED FIX
┌─────────────────────────────────────────────────────────────────┐
│ Use parameterized queries (prepared statements) instead of      │
│ string concatenation:                                           │
│                                                                  │
│ ❌ VULNERABLE CODE:                                             │
│ ```javascript                                                   │
│ const query = "SELECT * FROM users WHERE username = '" +        │
│               req.body.username + "' AND password = '" +        │
│               req.body.password + "'";                         │
│ ```                                                             │
│                                                                  │
│ ✅ SECURE CODE:                                                 │
│ ```javascript                                                   │
│ const query = "SELECT * FROM users WHERE username = $1 AND      │
│               password = $2";                                   │
│ const result = await db.query(query, [req.body.username,        │
│                                      req.body.password]);       │
│ ```                                                             │
│                                                                  │
│ [📋 Copy Code] [📄 View Full Guide]                             │
└─────────────────────────────────────────────────────────────────┘

REMEDIATION TIMELINE
┌─────────────────────────────────────────────────────────────────┐
│ 2026-03-14  │ Discovered                                        │
│ 2026-03-14  │ Assigned to John Doe                              │
│ 2026-03-15  │ Fix implemented in commit a1b2c3d                 │
│ 2026-03-16  │ Pending verification scan                         │
│ 2026-03-17  │ ⏳ Scheduled verification                         │
└─────────────────────────────────────────────────────────────────┘

VERIFICATION
┌─────────────────────────────────────────────────────────────────┐
│ Status: Pending Re-scan                                        │
│                                                                  │
│ [🔄 Run Verification Scan Now]                                  │
│                                                                  │
│ OR                                                               │
│                                                                  │
│ [✓ Mark as Fixed Manually] (requires justification)             │
└─────────────────────────────────────────────────────────────────┘

REFERENCES
┌─────────────────────────────────────────────────────────────────┐
│ • OWASP SQL Injection Prevention Cheat Sheet                    │
│ • CWE-89: Improper Neutralization of Special Elements           │
│ • PortSwigger SQL Injection Tutorial                            │
│ • SANS Top 25 - CWE/SANS Top 25 Most Dangerous Software Errors  │
└─────────────────────────────────────────────────────────────────┘
```

#### D. History Tab

```
ACTIVITY LOG
┌─────────────────────────────────────────────────────────────────┐
│ 2026-03-16 14:30:22 │ John Doe     │ Changed status to "In      │
│                     │              │ Progress"                  │
│ 2026-03-15 09:12:45 │ Jane Smith   │ Assigned to John Doe        │
│ 2026-03-14 16:45:33 │ System       │ Created ticket JIRA-1234    │
│ 2026-03-14 10:24:18 │ System       │ Status changed to           │
│                     │              │ "Confirmed"                │
│ 2026-03-14 10:23:45 │ Agent-02     │ Finding discovered          │
└─────────────────────────────────────────────────────────────────┘

PREVIOUS OCCURRENCES
┌─────────────────────────────────────────────────────────────────┐
│ This vulnerability was previously found and fixed:              │
│                                                                  │
│ • 2026-02-10 - Fixed in commit 4f5g6h7                         │
│ • 2026-01-15 - Fixed in commit 8i9j0k1                         │
│                                                                  │
│ ⚠️ REGRESSION: This vulnerability has reappeared 2 times        │
└─────────────────────────────────────────────────────────────────┘

SCAN COMPARISON
┌─────────────────────────────────────────────────────────────────┐
│ Scan #12345 (Current) │ Scan #12320 (Previous)                  │
│ • Severity: Critical  │ • Severity: High                        │
│ • CVSS: 9.8           │ • CVSS: 7.5                             │
│ • Impact: Increased   │                                         │
│                                                                  │
│ [📊 View Full Comparison]                                       │
└─────────────────────────────────────────────────────────────────┘
```

#### E. Comments Tab

```
DISCUSSION
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 John Doe - 2026-03-15 14:23                               │ │
│ │                                                             │ │
│ │ I've started working on the fix. The issue is in the       │ │
│ │ auth middleware. Should have a PR ready by EOD.            │ │
│ │                                                             │ │
│ │ [Reply] [👍 2]                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 Jane Smith - 2026-03-15 15:45                             │ │
│ │                                                             │ │
│ │ @John Doe - Please make sure to add tests for this case.   │ │
│ │ We don't want this regression to happen again.             │ │
│ │                                                             │ │
│ │ [Reply] [👍 1]                                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [💬 Add a comment...]                              [Post]       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. FILTRAGE AVANCÉ

#### Filtres Disponibles

```
ADVANCED FILTERS
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│ Severity:         [✓] Critical  [✓] High  [✓] Medium  [✓] Low  │
│                                                                  │
│ Status:           [All ▼]                                       │
│                   • New                                         │
│                   • Confirmed                                   │
│                   • In Progress                                 │
│                   • Fixed                                       │
│                   • False Positive                              │
│                   • Accepted Risk                               │
│                   • Closed                                      │
│                                                                  │
│ Asset:            [All ▼]  or  [Search...]                      │
│                                                                  │
│ Category:         [All ▼]                                       │
│                   • Injection                                   │
│                   • Broken Authentication                       │
│                   • Sensitive Data Exposure                     │
│                   • XXE                                         │
│                   • Broken Access Control                       │
│                   • Security Misconfiguration                   │
│                   • XSS                                         │
│                   • Insecure Deserialization                    │
│                   • Known Vulnerabilities                       │
│                   • Insufficient Logging                        │
│                                                                  │
│ Date Discovered:  [Last 7 days ▼]                               │
│                   • Last 24 hours                               │
│                   • Last 7 days                                 │
│                   • Last 30 days                                │
│                   • Custom range...                             │
│                                                                  │
│ CVSS Score:       [0 - 10]  [Slider]                           │
│                   Min: [0]  Max: [10]                          │
│                                                                  │
│ EPSS Score:       [0% - 100%]  [Slider]                        │
│                   Min: [0]  Max: [100]                         │
│                                                                  │
│ Assigned To:      [Anyone ▼]                                    │
│                   • Me                                          │
│                   • Unassigned                                  │
│                   • Specific person...                          │
│                                                                  │
│ Tags:             [Select tags... ▼]                            │
│                                                                  │
│                   [🔄 Reset]           [✓ Apply Filters]       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. ACTIONS DE MASSE

```
┌─────────────────────────────────────────────────────────────────┐
│ 23 findings selected                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Assign to:        [Select user ▼]                [Apply]       │
│                                                                  │
│ Change status:    [Select status ▼]              [Apply]       │
│                                                                  │
│ Add tags:         [Select tags ▼]                [Apply]       │
│                                                                  │
│ Due date:         [Date picker ▼]                [Apply]       │
│                                                                  │
│ Create tickets:   [Jira ▼]                       [Create]      │
│                                                                  │
│ Export:           [PDF ▼]                        [Export]      │
│                                                                  │
│ [🗑️ Delete Selected] (Admin only)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

### Couleurs de Sévérité
```css
--severity-critical: #DC2626;  /* Red - Immediate action required */
--severity-high: #EA580C;      /* Orange - Fix within 7 days */
--severity-medium: #D97706;    /* Amber - Fix within 30 days */
--severity-low: #2563EB;       /* Blue - Fix when possible */
--severity-info: #6B7280;      /* Gray - Informational */
```

### Couleurs de Statut
```css
--status-new: #3B82F6;         /* Blue */
--status-confirmed: #8B5CF6;   /* Purple */
--status-in-progress: #F59E0B; /* Amber */
--status-fixed: #10B981;       /* Green */
--status-false-positive: #6B7280; /* Gray */
--status-accepted: #EC4899;    /* Pink */
--status-closed: #1F2937;      /* Dark Gray */
```

### Icônes
- **Critical:** 🔴 ou 🚨
- **High:** 🟠 ou ⚠️
- **Medium:** 🟡 ou ⚡
- **Low:** 🔵 ou ℹ️
- **Info:** ⚪ ou 📝
- **New:** ✨
- **Fixed:** ✅
- **False Positive:** 🚫
- **External Link:** ↗️
- **Download:** 📥
- **Copy:** 📋

---

## ⚡ Interactions

### Temps Réel
- **Nouveau finding:** Notification toast + badge increment
- **Status change:** Animation slide + color transition
- **Assignation:** Avatar appear with fade
- **Severité change:** Pulse animation on card

### Actions Rapides
- **Hover sur ligne:** Boutons actions apparaissent
- **Click sur severity:** Filtre auto sur cette severity
- **Click sur asset:** Navigation vers asset detail
- **Double-click:** Ouverture détail

### Raccourcis Clavier
- `j/k` - Navigation up/down dans la liste
- `Enter` - Ouvrir détail
- `e` - Export selected
- `a` - Assign selected
- `f` - Focus search
- `?` - Show shortcuts

---

## 🔧 Fonctionnalités Avancées

### 1. Corrélation de Findings
```
SIMILAR FINDINGS DETECTED

This finding is similar to 3 others:
• XSS in /search (blog.example.com) - Same parameter
• XSS in /filter (shop.example.com) - Same root cause
• XSS in /tag (docs.example.com) - Same root cause

[📊 View All] [🔗 Group Findings] [🛠️ Bulk Fix]
```

### 2. Intelligence sur les Menaces
```
THREAT INTELLIGENCE

This vulnerability is actively exploited in the wild:
• EPSS Score: 0.42 (42% probability in 30 days)
• CISA KEV: Listed since 2026-01-15
• Exploit available: Yes (Metasploit, GitHub)
• Dark web mentions: 12 in last 30 days

⚠️ PRIORITY: Fix immediately
```

### 3. Validation Automatique
```
AUTO-VALIDATION

When a fix is deployed:
1. System detects code change (Git webhook)
2. Trigger verification scan automatically
3. Compare results with baseline
4. Update finding status to "Fixed" or still vulnerable
5. Notify assignee
```

### 4. SLAs et Due Dates
```
SLA TRACKING

Critical: Fix within 24 hours
High: Fix within 7 days
Medium: Fix within 30 days
Low: Fix within 90 days

Due Date calculated automatically based on severity.
Escalation notifications at 50%, 80%, 100% of SLA.
```

---

## 📊 Rapports et Exports

### Types de Rapports
1. **Executive Summary** - Vue haut niveau pour C-level
2. **Technical Report** - Détails complets pour équipe tech
3. **Developer Report** - Guide de remédiation
4. **Compliance Report** - Mapping réglementaire
5. **Comparison Report** - Avant/Après remédiation

### Formats d'Export
- PDF (formaté avec logo)
- HTML (interactif)
- CSV (données brutes)
- JSON (API/integration)
- SARIF (Standard format)
- XML (Legacy systems)

---

## ✅ Checklist d'Implémentation

### Phase 1: Base (Sprint 1)
- [ ] Liste des findings avec filtres
- [ ] Cards de résumé par sévérité
- [ ] Vue table avec tri
- [ ] Pagination

### Phase 2: Détail (Sprint 2)
- [ ] Page détail finding
- [ ] Tabs (Overview, Evidence, Remediation)
- [ ] CVSS calculator
- [ ] Preuve de concept

### Phase 3: Workflow (Sprint 3)
- [ ] Changement de statut
- [ ] Assignation
- [ ] Due dates
- [ ] Bulk actions

### Phase 4: Intégrations (Sprint 4)
- [ ] Jira/GitHub tickets
- [ ] Export rapports
- [ ] Commentaires
- [ ] Activity log

### Phase 5: Avancé (Sprint 5)
- [ ] Vue Kanban
- [ ] Corrélation
- [ ] Threat intel
- [ ] Auto-validation

---

## 🔗 API Endpoints

```typescript
// Findings
GET    /api/findings                    // Liste avec filtres
GET    /api/findings/:id                // Détail
PUT    /api/findings/:id                // Modifier
DELETE /api/findings/:id                // Supprimer
POST   /api/findings/:id/status         // Changer statut
POST   /api/findings/:id/assign         // Assigner
POST   /api/findings/bulk-action        // Actions de masse

// Export
GET    /api/findings/export/pdf         // Export PDF
GET    /api/findings/export/csv         // Export CSV
GET    /api/findings/export/sarif       // Export SARIF

// Comments
GET    /api/findings/:id/comments       // Liste commentaires
POST   /api/findings/:id/comments       // Ajouter commentaire

// Evidence
GET    /api/findings/:id/evidence       // Preuves
POST   /api/findings/:id/evidence       // Ajouter preuve
```

---

## 📚 Références

- **DefectDojo** - Open source vulnerability management
- **ThreadFix** - Vulnerability aggregation platform
- **Kenna Security** - Risk-based vulnerability management
- **Vulcan Cyber** - Remediation orchestration

---

**Version:** 1.0  
**Date:** Mars 2026  
**Auteur:** Claude Code  
**Statut:** Prêt pour implémentation
