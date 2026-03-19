# ⚙️ ONGLET SETTINGS - Spécifications Complètes

## Vue d'Ensemble

L'onglet **Settings** est le centre de configuration de l'application. C'est l'équivalent du "Control Panel" ou "Admin Dashboard" où les utilisateurs configurent tous les aspects de la plateforme : providers AI, notifications, sécurité, intégrations, et préférences utilisateur.

---

## 🎯 Objectifs Utilisateur

1. **Configurer** les providers AI et modèles
2. **Gérer** les notifications et alertes
3. **Paramétrer** les politiques de sécurité
4. **Intégrer** avec des outils externes (Jira, Slack, etc.)
5. **Personnaliser** l'expérience utilisateur
6. **Administrer** les utilisateurs et permissions

---

## 📐 Structure de l'Interface

### Layout Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Settings                                    [Save All] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐ ┌─────────────────────────────────────────────┐│
│  │   MENU      │ │                                           ││
│  │   LATÉRAL   │ │         ZONE DE CONFIGURATION             ││
│  │             │ │                                           ││
│  │ • General   │ │  [Contenu dynamique selon section]        ││
│  │ • AI/LLM    │ │                                           ││
│  │ • Scanners  │ │                                           ││
│  │ • Notif.    │ │                                           ││
│  │ • Security  │ │                                           ││
│  │ • Integr.   │ │                                           ││
│  │ • Users     │ │                                           ││
│  │ • Billing   │ │                                           ││
│  │ • Advanced  │ │                                           ││
│  │             │ │                                           ││
│  └─────────────┘ └─────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture des Sections

### 1. GENERAL SETTINGS

#### A. Application Preferences

```
┌─────────────────────────────────────────────────────────────────┐
│ GENERAL SETTINGS                                     [Save ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ APPEARANCE                                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Theme:              [◉ Light] [○ Dark] [○ System]            │ │
│ │                                                     [Preview]│ │
│ │                                                             │ │
│ │ Language:           [English ▼]                             │ │
│ │                     • English                               │ │
│ │                     • Français                              │ │
│ │                     • Español                               │ │
│ │                     • Deutsch                               │ │
│ │                                                             │ │
│ │ Date/Time Format:   [MM/DD/YYYY 12h ▼]                      │ │
│ │ Timezone:           [UTC+01:00 Europe/Paris ▼]              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DASHBOARD                                                        │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Default View:       [Dashboard ▼]                           │ │
│ │                     • Dashboard                               │ │
│ │                     • Pentest List                            │ │
│ │                     • Recent Activity                         │ │
│ │                                                             │ │
│ │ Items per page:     [20 ▼]                                  │ │
│ │                     • 10 • 20 • 50 • 100                      │ │
│ │                                                             │ │
│ │ Auto-refresh:       [✓] Every [30 ▼] seconds                │ │
│ │                                                             │ │
│ │ Show welcome guide: [✓] On startup                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DATA & PRIVACY                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Analytics:          [✓] Share usage data to improve LEA     │ │
│ │                                                             │ │
│ │ Error reporting:    [✓] Send crash reports automatically    │ │
│ │                                                             │ │
│ │ Export my data:     [📥 Download all my data]               │ │
│ │                                                             │ │
│ │ Delete account:     [🗑️ Permanently delete my account]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. AI / LLM PROVIDERS

#### A. Configuration des Providers

```
┌─────────────────────────────────────────────────────────────────┐
│ AI / LLM PROVIDERS                                   [+ Add New]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ CONFIGURED PROVIDERS                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │ 🅰️ ANTHROPIC                                    [⋯] [Test]  │ │
│ │    Status: ● Connected  Latency: 45ms                      │ │
│ │    Models: 3 configured  Default: Claude Sonnet 4.5        │ │
│ │    Usage: 1.2M tokens / $0.84 this month                   │ │
│ │                                                             │ │
│ │ ─────────────────────────────────────────────────────────   │ │
│ │                                                             │ │
│ │ 🔵 ZHIPU (GLM)                                    [⋯] [Test] │ │
│ │    Status: ● Connected  Latency: 120ms                     │ │
│ │    Models: 5 configured  Default: GLM-4.7                  │ │
│ │    Usage: 800K tokens / $0.32 this month                   │ │
│ │                                                             │ │
│ │ ─────────────────────────────────────────────────────────   │ │
│ │                                                             │ │
│ │ 🔴 OPENAI                                         [⋯] [Test] │ │
│ │    Status: ⚠️ Degraded  Latency: 230ms                     │ │
│ │    Last error: Rate limit exceeded 5 min ago               │ │
│ │    [Retry Connection]                                       │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ADD NEW PROVIDER                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Provider Type:    [Select provider ▼]                       │ │
│ │                   • Anthropic                               │ │
│ │                   • OpenAI                                  │ │
│ │                   • Google (Gemini)                         │ │
│ │                   • Azure OpenAI                            │ │
│ │                   • Custom (OpenAI-compatible)              │ │
│ │                                                             │ │
│ │ Display Name:     [My Anthropic Account                    ]│ │
│ │                                                             │ │
│ │ API Key:          [•••••••••••••••••••••••••••••••••   ]│ │
│ │                   [Show] [Validate]                         │ │
│ │                                                             │ │
│ │ [Cancel]                                    [Add Provider]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DEFAULT SETTINGS                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Default Provider:   [Anthropic ▼]                           │ │
│ │                                                             │ │
│ │ Default Model:      [Claude Sonnet 4.5 ▼]                   │ │
│ │                     • Claude Opus 4.5 ($15/1M tokens)       │ │
│ │                     • Claude Sonnet 4.5 ($3/1M tokens)      │ │
│ │                     • Claude Haiku 3.5 ($0.8/1M tokens)     │ │
│ │                                                             │ │
│ │ Thinking Budget:    [Standard ▼]                            │ │
│ │                     • Quick (4K tokens)                     │ │
│ │                     • Standard (16K tokens)                 │ │
│ │                     • Deep (64K tokens)                     │ │
│ │                     • Maximum (200K+ tokens)                │ │
│ │                                                             │ │
│ │ Fallback Chain:     [Configure ▼]                           │ │
│ │                     If Anthropic fails → Use Zhipu → Use OpenAI│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ USAGE LIMITS                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Monthly Budget:     [$100 ▼]                                │ │
│ │ Current usage:      $1.16 / $100 (1.16%)                   │ │
│ │ █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │ │
│ │                                                             │ │
│ │ Alert at:          [80% ▼] of budget                       │ │
│ │                                                             │ │
│ │ Action at limit:   [Pause new scans ▼]                     │ │
│ │                    • Pause new scans                        │ │
│ │                    • Switch to cheapest provider            │ │
│ │                    • Continue with warnings                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Gestion des Modèles

```
CONFIGURED MODELS
┌─────────────────────────────────────────────────────────────────┐
│ Model                  │ Provider   │ Context │ Price/1M │ Status│
├─────────────────────────────────────────────────────────────────┤
│ Claude Opus 4.5        │ Anthropic  │ 200K    │ $15/$75  │ ✓    │
│ Claude Sonnet 4.5      │ Anthropic  │ 200K    │ $3/$15   │ ✓ Def│
│ Claude Haiku 3.5       │ Anthropic  │ 200K    │ $0.8/$4  │ ✓    │
│ GLM-4.7                │ Zhipu      │ 200K    │ $2/$8    │ ✓    │
│ GLM-4 Flash            │ Zhipu      │ 128K    │ $0.5/$2  │ ✓    │
│ GPT-4o                 │ OpenAI     │ 128K    │ $5/$15   │ ⚠️   │
├─────────────────────────────────────────────────────────────────┤
│ [+ Add Custom Model]                                           │
└─────────────────────────────────────────────────────────────────┘

[Edit] [Disable] [Set as Default] [Test] [Delete]
```

---

### 3. SCANNER CONFIGURATION

#### A. Profils de Scan

```
┌─────────────────────────────────────────────────────────────────┐
│ SCANNER CONFIGURATION                                [+ New ▼]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ SCAN PROFILES                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │ ⚡ QUICK SCAN                                    [⋯] [Edit]  │ │
│ │    Duration: ~15 min  Depth: Surface                      │ │
│ │    Coverage: OWASP Top 5                                  │ │
│ │    [Set as Default]                                       │ │
│ │                                                             │ │
│ │ ● STANDARD SCAN (Default)                        [⋯] [Edit] │ │
│ │    Duration: ~45 min  Depth: Standard                     │ │
│ │    Coverage: OWASP Top 10 + Business Logic                │ │
│ │    [✓ Default]                                            │ │
│ │                                                             │ │
│ │ 🔍 DEEP SCAN                                     [⋯] [Edit] │ │
│ │    Duration: ~2 hours  Depth: Comprehensive               │ │
│ │    Coverage: All checks + Zero-day hunting                │ │
│ │    [Set as Default]                                       │ │
│ │                                                             │ │
│ │ ⚙️ CUSTOM: PCI-DSS Compliance                    [⋯] [Edit] │ │
│ │    Duration: ~1 hour  Custom rules enabled                │ │
│ │    [Set as Default]  [Delete]                             │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ CREATE CUSTOM PROFILE                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Profile Name:     [My Custom Scan                          ]│ │
│ │                                                             │ │
│ │ Description:      [Detailed scan for API endpoints         ]│ │
│ │                                                             │ │
│ │ BASED ON TEMPLATE: [Standard Scan ▼]                        │ │
│ │                                                             │ │
│ │ SCAN DEPTH:                                                 │ │
│ │ [──────────●──────]                                         │ │
│ │ Surface        Standard        Deep        Comprehensive    │ │
│ │                                                             │ │
│ │ TOOL SELECTION:                                             │ │
│ │ [✓] Web Scanner       [✓] API Scanner       [✓] Crawler   │ │
│ │ [✓] SQLMap            [✓] Nmap              [✓] Nikto     │ │
│ │ [ ] Metasploit        [✓] Custom Scripts    [ ] Fuzzer    │ │
│ │                                                             │ │
│ │ ADVANCED:                                                   │ │
│ │ [Configure ▼]                                               │ │
│ │                                                             │ │
│ │ [Cancel]                                    [Create Profile]│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Configuration des Outils

```
TOOL CONFIGURATION
┌─────────────────────────────────────────────────────────────────┐
│ NMAP                                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Port Range:        [Top 1000 ▼]                             │ │
│ │                    • Top 100 • Top 1000 • All 65535 • Custom │ │
│ │                                                             │ │
│ │ Scan Type:         [-sS (SYN) ▼]                            │ │
│ │ Timing Template:   [T4 (Aggressive) ▼]                      │ │
│ │ Service Detection: [✓] Enable version detection             │ │
│ │ OS Detection:      [ ] Enable OS detection                  │ │
│ │                                                             │ │
│ │ Custom Flags:      [                                        ]│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ SQLMAP                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Level:             [1 ▼] (1-5)                              │ │
│ │ Risk:              [1 ▼] (1-3)                              │ │
│ │                                                             │ │
│ │ Techniques:        [BEUSTQ ▼]                               │ │
│ │ [✓] Boolean-based blind    [✓] Error-based                 │ │
│ │ [✓] Union query            [✓] Stacked queries             │ │
│ │ [✓] Time-based blind       [✓] Inline queries              │ │
│ │                                                             │ │
│ │ Limit:             [50 ▼] URLs to test per scan             │ │
│ │ Timeout:           [600 ▼] seconds per test                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ CUSTOM TOOLS                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [+ Add Custom Tool]                                         │ │
│ │                                                             │ │
│ │ • api-tester (v1.2)                    [Configure] [Delete] │ │
│ │   Custom API security testing script                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. NOTIFICATIONS

#### A. Configuration des Canaux

```
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATIONS                                        [+ Channel]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ EMAIL                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [✓] Configured                            │ │
│ │ SMTP Server:      smtp.company.com:587                      │ │
│ │ From Address:     security@company.com                      │ │
│ │                                                             │ │
│ │ [Test Connection]  [Edit Configuration]                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ SLACK                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [✓] Connected                             │ │
│ │ Workspace:        MyCompany                                 │ │
│ │ Default Channel:  #security-alerts                          │ │
│ │                                                             │ │
│ │ [Disconnect]  [Configure]                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ MICROSOFT TEAMS                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [○ Not configured]                        │ │
│ │                                                             │ │
│ │ [Connect Teams]                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ WEBHOOK                                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [+ Add Webhook]                                             │ │
│ │                                                             │ │
│ │ • Security Dashboard Webhook       [Test] [Edit] [Delete]   │ │
│ │   https://dashboard.company.com/webhooks/lea               │ │
│ │                                                             │ │
│ │ • PagerDuty Integration            [Test] [Edit] [Delete]   │ │
│ │   https://events.pagerduty.com/integration/abc123/enqueue  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Règles de Notification

```
NOTIFICATION RULES
┌─────────────────────────────────────────────────────────────────┐
│ [+ Create New Rule]                                             │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Rule: CRITICAL FINDINGS                        [⋯] [Edit]   │ │
│ │                                                             │ │
│ │ WHEN:                                                       │ │
│ │   [Severity] [is] [Critical]                                │ │
│ │   AND [Status] [is] [New or Confirmed]                      │ │
│ │                                                             │ │
│ │ THEN:                                                       │ │
│ │   ✓ Send Email to security@company.com                     │ │
│ │   ✓ Post to Slack #security-alerts                         │ │
│ │   ✓ Page on-call engineer (PagerDuty)                      │ │
│ │                                                             │ │
│ │ [✓] Enabled                                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Rule: SCAN COMPLETION                          [⋯] [Edit]   │ │
│ │                                                             │ │
│ │ WHEN:                                                       │ │
│ │   [Scan Status] [changes to] [Completed]                    │ │
│ │                                                             │ │
│ │ THEN:                                                       │ │
│ │   ✓ Send Email to scan requester                           │ │
│ │   ✓ Post summary to Slack #security                        │ │
│ │                                                             │ │
│ │ [✓] Enabled                                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Rule: AGENT OFFLINE                            [⋯] [Edit]   │ │
│ │                                                             │ │
│ │ WHEN:                                                       │ │
│ │   [Agent Status] [is] [Offline for more than] [15 min]      │ │
│ │                                                             │ │
│ │ THEN:                                                       │ │
│ │   ✓ Send Email to admin@company.com                        │ │
│ │                                                             │ │
│ │ [✓] Enabled                                                 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Test All Rules]                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### C. Préférences de Notification

```
NOTIFICATION PREFERENCES
┌─────────────────────────────────────────────────────────────────┐
│ FREQUENCY                                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Critical alerts:    [◉ Immediately] [○ Hourly digest]        │ │
│ │ High alerts:        [○ Immediately] [◉ Hourly digest]        │ │
│ │ Medium/Low:         [○ Immediately] [○ Hourly] [◉ Daily]     │ │
│ │                                                             │ │
│ │ Quiet hours:        [✓] Enable                               │ │
│ │                     From [22:00] to [08:00]                  │ │
│ │                     (Non-critical notifications delayed)     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DIGEST OPTIONS                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Include in daily digest:                                    │ │
│ │ [✓] New findings summary                                     │ │
│ │ [✓] Completed scans                                          │ │
│ │ [✓] Agent status changes                                     │ │
│ │ [ ] System updates                                           │ │
│ │                                                             │ │
│ │ Digest time:        [08:00 ▼]                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5. SECURITY & COMPLIANCE

#### A. Politiques de Sécurité

```
┌─────────────────────────────────────────────────────────────────┐
│ SECURITY & COMPLIANCE                                [Audit Log]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ACCESS CONTROL                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Authentication:       [SSO (SAML) ▼]                        │ │
│ │                       • Local Authentication                │ │
│ │                       • SSO (SAML 2.0)                      │ │
│ │                       • SSO (OIDC)                          │ │
│ │                       • LDAP                                │ │
│ │                                                             │ │
│ │ Session timeout:      [8 hours ▼]                           │ │
│ │                       • 1 hour • 4 hours • 8 hours • 24h    │ │
│ │                                                             │ │
│ │ Require MFA:          [✓] Yes                               │ │
│ │ MFA Method:           [TOTP App ▼]                          │ │
│ │                       • TOTP (Google Authenticator)         │ │
│ │                       • Hardware Security Key (WebAuthn)    │ │
│ │                       • SMS                                 │ │
│ │                                                             │ │
│ │ IP Allowlist:         [Configure ▼]                         │ │
│ │                       Restrict access to specific IP ranges │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ PASSWORD POLICY                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Minimum length:       [12 ▼] characters                     │ │
│ │ Require uppercase:    [✓]                                   │ │
│ │ Require lowercase:    [✓]                                   │ │
│ │ Require numbers:      [✓]                                   │ │
│ │ Require special:      [✓]                                   │ │
│ │ Password expiry:      [90 ▼] days                           │ │
│ │ Prevent reuse:        [5 ▼] last passwords                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DATA RETENTION                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Scan results:         [365 ▼] days                          │ │
│ │ Logs:                 [90 ▼] days                           │ │
│ │ Audit trails:         [2555 ▼] days (7 years)               │ │
│ │                                                             │ │
│ │ Automatic cleanup:    [✓] Enabled                           │ │
│ │ Cleanup schedule:     [Weekly on Sunday at 02:00 ▼]         │ │
│ │                                                             │ │
│ │ [⚠️ Warning: Data older than retention will be permanently  │ │
│ │  deleted. Export important data before cleanup.]             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ENCRYPTION                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Data at rest:         AES-256-GCM  [✓] Enabled              │ │
│ │ Data in transit:      TLS 1.3    [✓] Enabled                │ │
│ │ Key rotation:         [Every 90 days ▼]                     │ │
│ │                                                             │ │
│ │ API Key encryption:   [✓] Enabled                           │ │
│ │ Master key:           [🔑 Rotate Now]                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ COMPLIANCE FRAMEWORKS                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [✓] OWASP Top 10 Mapping                                    │ │
│ │ [✓] CWE Classification                                      │ │
│ │ [✓] CVSS v3.1 Scoring                                       │ │
│ │ [✓] PCI-DSS Requirements                                    │ │
│ │ [✓] ISO 27001 Controls                                      │ │
│ │ [✓] NIST 800-53 Controls                                    │ │
│ │ [ ] SOC 2 (Requires Enterprise plan)                        │ │
│ │ [ ] GDPR Data Mapping                                       │ │
│ │                                                             │ │
│ │ [Generate Compliance Report]                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. INTEGRATIONS

#### A. Ticketing Systems

```
┌─────────────────────────────────────────────────────────────────┐
│ INTEGRATIONS                                         [+ Connect]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ JIRA                                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [✓] Connected                             │ │
│ │ URL:              https://company.atlassian.net             │ │
│ │ Project:          SEC (Security)                            │ │
│ │ Default Issue:    Vulnerability                             │ │
│ │                                                             │ │
│ │ Auto-create tickets:                                        │ │
│ │ [✓] For Critical findings                                   │ │
│ │ [✓] For High findings                                       │ │
│ │ [ ] For Medium findings                                     │ │
│ │                                                             │ │
│ │ Sync status:      [✓] Bidirectional                         │ │
│ │ Last sync:        2 minutes ago                             │ │
│ │                                                             │ │
│ │ [Configure] [Disconnect]                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ GITHUB                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [✓] Connected                             │ │
│ │ Organization:     mycompany                                 │ │
│ │ Default Repo:     security-issues                           │ │
│ │                                                             │ │
│ │ [Configure] [Disconnect]                                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ SERVICENOW                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [○ Not connected]                         │ │
│ │                                                             │ │
│ │ [Connect ServiceNow]                                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### B. CI/CD Integration

```
CI/CD INTEGRATION
┌─────────────────────────────────────────────────────────────────┐
│ GITHUB ACTIONS                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Workflow file:    .github/workflows/security-scan.yml       │ │
│ │                                                             │ │
│ │ Trigger on:                                                 │ │
│ │ [✓] Pull requests                                           │ │
│ │ [✓] Push to main branch                                     │ │
│ │ [ ] Scheduled (nightly)                                     │ │
│ │                                                             │ │
│ │ Scan type:        [Quick ▼]                                 │ │
│ │ Fail pipeline on: [High or above ▼]                         │ │
│ │                                                             │ │
│ │ [📋 Copy Workflow YAML]                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ GITLAB CI                                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Configure GitLab CI]                                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ JENKINS                                                         │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Plugin version:   LEA Security Scanner v2.4.1               │ │
│ │                                                             │ │
│ │ [Download Plugin]  [View Documentation]                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### C. SIEM Integration

```
SIEM INTEGRATION
┌─────────────────────────────────────────────────────────────────┐
│ SPLUNK                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [✓] Connected                             │ │
│ │ HEC URL:          https://splunk.company.com:8088           │ │
│ │ Index:            security_lea                              │ │
│ │ Source type:      lea:findings                              │ │
│ │                                                             │ │
│ │ Forward events:                                             │ │
│ │ [✓] New findings                                            │ │
│ │ [✓] Scan completions                                        │ │
│ │ [✓] Agent status changes                                    │ │
│ │ [ ] System logs                                             │ │
│ │                                                             │ │
│ │ [Test Forwarding] [Configure] [Disconnect]                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ELASTICSEARCH / ELK                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Status:           [○ Not configured]                        │ │
│ │                                                             │ │
│ │ [Configure ELK]                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ CUSTOM WEBHOOK                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [+ Add Custom Integration]                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. USER MANAGEMENT (Admin Only)

```
┌─────────────────────────────────────────────────────────────────┐
│ USER MANAGEMENT                                      [+ Invite] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ USERS (12 total)                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Name              │ Email              │ Role     │ Status   │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 👤 John Doe       │ john@company.com   │ Admin    │ ● Active │ │
│ │ 👤 Jane Smith     │ jane@company.com   │ Operator │ ● Active │ │
│ │ 👤 Bob Wilson     │ bob@company.com    │ Viewer   │ ● Active │ │
│ │ 👤 Alice Brown    │ alice@company.com  │ Operator │ ○ Invited│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Edit] [Change Role] [Deactivate] [Delete]                      │
│                                                                  │
│ ROLES & PERMISSIONS                                             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │                                                             │ │
│ │ 👑 ADMINISTRATOR                              [Edit] [Delete]│ │
│ │    Full access to all features and settings                │ │
│ │    • Manage users and permissions                          │ │
│ │    • Configure providers and integrations                  │ │
│ │    • Access billing information                            │ │
│ │    • Delete pentests and data                              │ │
│ │                                                             │ │
│ │ ─────────────────────────────────────────────────────────   │ │
│ │                                                             │ │
│ │ 🔧 OPERATOR                                   [Edit] [Delete]│ │
│ │    Can run scans and manage findings                       │ │
│ │    • Create and run pentests                               │ │
│ │    • View and manage findings                              │ │
│ │    • Configure scan settings                               │ │
│ │    • Cannot manage users or billing                        │ │
│ │                                                             │ │
│ │ ─────────────────────────────────────────────────────────   │ │
│ │                                                             │ │
│ │ 👁️ VIEWER                                     [Edit] [Delete]│ │
│ │    Read-only access to reports and findings                │ │
│ │    • View findings and reports                             │ │
│ │    • Cannot run scans or modify data                       │ │
│ │                                                             │ │
│ │ [+ Create Custom Role]                                      │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ INVITE USER                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Email:            [user@company.com                        ]│ │
│ │ Role:             [Operator ▼]                              │ │
│ │ Send welcome:     [✓] Yes                                   │ │
│ │                                                             │ │
│ │ [Cancel]                                    [Send Invite]   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8. BILLING & USAGE

```
┌─────────────────────────────────────────────────────────────────┐
│ BILLING & USAGE                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ CURRENT PLAN                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Plan:             Professional                              │ │
│ │ Price:            $299/month                                │ │
│ │ Renewal:          April 15, 2026                            │ │
│ │                                                             │ │
│ │ Included:                                                   │ │
│ │ • Unlimited scans                                           │ │
│ │ • 10 team members                                           │ │
│ │ • Priority support                                          │ │
│ │ • Custom integrations                                       │ │
│ │                                                             │ │
│ │ [Change Plan]  [Cancel Subscription]                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ USAGE THIS MONTH                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AI Tokens:        2.3M / 5M included (46%)                  │ │
│ │ ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │ │
│ │                                                             │ │
│ │ Scans:            45 / Unlimited                            │ │
│ │                                                             │ │
│ │ Storage:          12.4 GB / 50 GB included (25%)            │ │
│ │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │ │
│ │                                                             │ │
│ │ Team Members:     8 / 10 included                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ PAYMENT METHOD                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 💳 Visa ending in 4242                                      │ │
│ │ Expires: 12/2027                                            │ │
│ │                                                             │ │
│ │ [Update] [Remove]                                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ INVOICE HISTORY                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Date           │ Description        │ Amount    │ Status     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ Mar 1, 2026    │ Professional Plan  │ $299.00   │ Paid       │ │
│ │ Feb 1, 2026    │ Professional Plan  │ $299.00   │ Paid       │ │
│ │ Jan 1, 2026    │ Professional Plan  │ $299.00   │ Paid       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Download All Invoices]                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 9. ADVANCED SETTINGS

```
┌─────────────────────────────────────────────────────────────────┐
│ ADVANCED SETTINGS                                    [⚠️ Caution]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ API ACCESS                                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ API Keys:                                                   │ │
│ │ • Production Key: lea_live_••••••••••••••••  [Regenerate] │ │
│ │ • Test Key:      lea_test_••••••••••••••••  [Regenerate] │ │
│ │                                                             │ │
│ │ Rate Limiting:    1000 requests/hour                        │ │
│ │                                                             │ │
│ │ [📖 API Documentation]                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ PERFORMANCE                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Concurrent scans:   [5 ▼]                                   │ │
│ │ Scan timeout:       [4 hours ▼]                             │ │
│ │ Connection pool:    [100 ▼]                                 │ │
│ │                                                             │ │
│ │ [✓] Enable response caching                                 │ │
│ │ Cache duration:     [1 hour ▼]                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ BACKUP & EXPORT                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Automatic backups:  [✓] Daily                               │ │
│ │ Retention:          [30 days ▼]                             │ │
│ │                                                             │ │
│ │ [💾 Backup Now]                                             │ │
│ │ [📥 Export All Data]                                        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DANGER ZONE                                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⚠️ These actions are irreversible                            │ │
│ │                                                             │ │
│ │ [🗑️ Delete All Scan Data]                                   │ │
│ │ [🗑️ Delete All Findings]                                    │ │
│ │ [🗑️ Reset to Factory Defaults]                              │ │
│ │                                                             │ │
│ │ Type "DELETE" to confirm any destructive action             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

### Organisation Visuelle
- **Menu latéral:** Largeur fixe 240px, icônes + texte
- **Sections:** Groupées par fonctionnalité
- **Cards:** Conteneurs blancs avec ombre légère
- **Formulaires:** Labels au-dessus, inputs alignés
- **Actions:** Boutons "Save" sticky en bas de page

### Icônes par Section
- **General:** ⚙️
- **AI/LLM:** 🤖
- **Scanners:** 🕷️
- **Notifications:** 🔔
- **Security:** 🔒
- **Integrations:** 🔌
- **Users:** 👥
- **Billing:** 💳
- **Advanced:** ⚡

### Patterns d'Interaction
- **Unsaved changes:** Badge "Modified" + bouton "Save" actif
- **Validation:** Inline validation avec messages d'erreur
- **Test connections:** Boutons "Test" à côté des configs
- **Confirmations:** Modales pour actions destructrices
- **Toasts:** Notifications de succès/erreur après sauvegarde

---

## ✅ Checklist d'Implémentation

### Phase 1: Base (Sprint 1)
- [ ] Layout avec menu latéral
- [ ] Navigation entre sections
- [ ] Formulaire General Settings
- [ ] Sauvegarde des préférences

### Phase 2: AI Providers (Sprint 2)
- [ ] Liste des providers
- [ ] Ajout/édition de provider
- [ ] Test de connexion
- [ ] Configuration des modèles

### Phase 3: Scanner Config (Sprint 3)
- [ ] Scan profiles
- [ ] Tool configuration
- [ ] Custom profiles

### Phase 4: Notifications (Sprint 4)
- [ ] Configuration canaux
- [ ] Règles de notification
- [ ] Test notifications

### Phase 5: Security & Integrations (Sprint 5)
- [ ] SSO configuration
- [ ] Password policies
- [ ] Jira/GitHub integration
- [ ] CI/CD webhooks

### Phase 6: Admin (Sprint 6)
- [ ] User management
- [ ] Roles & permissions
- [ ] Billing interface
- [ ] API keys

---

## 🔗 API Endpoints

```typescript
// Settings
GET    /api/settings                    // All settings
PUT    /api/settings                    // Update settings

// Providers
GET    /api/settings/providers          // List providers
POST   /api/settings/providers          // Add provider
PUT    /api/settings/providers/:id      // Update provider
DELETE /api/settings/providers/:id      // Delete provider

// Notifications
GET    /api/settings/notifications      // Notification config
PUT    /api/settings/notifications      // Update notifications
POST   /api/settings/notifications/test // Test notification

// Integrations
GET    /api/settings/integrations       // List integrations
POST   /api/settings/integrations       // Add integration
DELETE /api/settings/integrations/:id   // Remove integration

// Users (Admin)
GET    /api/admin/users                 // List users
POST   /api/admin/users                 // Create user
PUT    /api/admin/users/:id             // Update user
DELETE /api/admin/users/:id             // Delete user
GET    /api/admin/roles                 // List roles
```

---

**Version:** 1.0  
**Date:** Mars 2026  
**Auteur:** Claude Code  
**Statut:** Prêt pour implémentation
