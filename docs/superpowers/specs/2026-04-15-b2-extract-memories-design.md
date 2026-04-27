# B2 — Extract Memories — Design Spec

**Date:** 2026-04-15
**Status:** Validated
**Bloc:** B (Session memory → Extract memories → Away summary → Checkpoint)

## Objectif

Extraire des faits stables et durables depuis les conversations d'agents swarm, à des points de checkpoint définis (fin d'agent, post-compaction, shutdown). Ces mémoires sont persistées en base de données, requêtables cross-session, et réinjectables dans de nouveaux runs du même projet.

**Types de mémoires :**
- Faits pentest (ports, services, tech stack)
- Findings (vulnérabilités observées)
- Préférences utilisateur détectées
- Décisions prises pendant le run
- Contraintes identifiées

---

## 1. Modèle Prisma

### `ExtractedMemory`

```prisma
model ExtractedMemory {
  id            String   @id @default(uuid())
  projectKey    String   // Clé stable cross-session (ex: domaine cible ou nom projet)
  swarmRunId    String   // Run swarm source
  agentId       String   // Agent qui a produit/observé le fait
  pentestId     String?  // Lien optionnel vers le pentest
  type          MemoryType
  category      String   // Sous-catégorie libre (open_port, service_detected, user_pref_tool, ...)
  title         String   // Court, lisible ("Port 22 open on 10.0.0.5")
  payload       Json     // JSON structuré exploitable par API/UI
  confidence    Float    @default(1.0) // 0-1, confiance LLM
  sourceTurns   Int[]    // Séquences absolues des messages source
  trigger       String   // 'agent_complete' | 'post_compaction' | 'swarm_shutdown' | 'manual'
  createdAt     DateTime @default(now())

  @@index([projectKey])
  @@index([swarmRunId])
  @@index([agentId])
  @@index([pentestId])
  @@index([type])
}
```

### `MemoryType` enum

```prisma
enum MemoryType {
  TARGET_FACT        // Fait sur la cible (port, service, OS, tech stack)
  FINDING            // Vulnérabilité ou observation de sécurité
  USER_PREFERENCE    // Préférence utilisateur détectée
  DECISION           // Choix fait pendant le run
  CONSTRAINT         // Limite posée
}
```

### Exemples de payload JSON par type

```json
// TARGET_FACT
{ "target": "10.0.0.5", "port": 22, "service": "ssh", "product": "OpenSSH 8.9p1" }

// FINDING
{ "severity": "medium", "cve": "CVE-2021-XXXX", "title": "SSH weak kex" }

// USER_PREFERENCE
{ "preference": "tool_choice", "value": "nmap", "context": "reconnaissance phase" }

// DECISION
{ "decision": "scan_scope", "rationale": "subnet too large", "outcome": "restricted_to_10.0.0.0/24" }

// CONSTRAINT
{ "constraint": "rate_limit", "detail": "max 10 req/s to target" }
```

---

## 2. Service `MemoryExtractor`

**Fichier :** `backend/src/core/memory/MemoryExtractor.ts`

### Interface

```typescript
type ExtractionTrigger = 'agent_complete' | 'post_compaction' | 'swarm_shutdown' | 'manual';

interface ExtractMessageInput {
  role: string;
  content: string;
  sequence?: number;  // Séquence absolue depuis SessionMessage
}

interface ExtractResult {
  count: number;
  memories: ExtractedMemoryRaw[];
  trigger: ExtractionTrigger;
  durationMs: number;
}

class MemoryExtractor {
  constructor(deps: {
    prisma: PrismaClient;
    memoryStore: SessionMemoryStore;
    callModel: (params: ModelCallParams) => AsyncGenerator<StreamEvent>;
  });

  /** Extrait depuis une session complète via getEffectiveContext(). */
  async extractFromSession(params: {
    swarmRunId: string;
    agentId: string;
    pentestId?: string;
    projectKey: string;      // Requis. Pas de fallback.
    trigger: ExtractionTrigger;
    maxRecentMessages?: number; // Défaut: 30
  }): Promise<ExtractResult>;

  /** Extrait depuis un ensemble de messages explicites (post-compaction). */
  async extractFromMessages(params: {
    messages: ExtractMessageInput[];
    swarmRunId: string;
    agentId: string;
    pentestId?: string;
    projectKey: string;      // Requis.
    trigger: ExtractionTrigger;
  }): Promise<ExtractResult>;

  /** Liste les mémoires d'un projet (cross-session). */
  listByProject(projectKey: string, options?: {
    types?: MemoryType[];
    limit?: number;
    since?: Date;
  }): Promise<ExtractedMemoryRaw[]>;

  /** Vérifie si une extraction terminale a déjà été faite (garde-fou shutdown). */
  async wasTerminalExtractionDone(swarmRunId: string, agentId: string): Promise<boolean>;
}
```

### Comportement

#### `extractFromSession()`
1. Appelle `memoryStore.getEffectiveContext(swarmRunId)` → `{ latestSummary, recentActiveMessages }`
2. Construit le prompt avec : summary (contexte historique) + N messages récents (détail frais)
3. Appelle le LLM avec le prompt d'extraction
4. Parse la réponse JSON array
5. Pour chaque mémoire :
   - **Dédup backend** : vérifie si `(projectKey, title)` existe déjà → skip si oui
6. Persiste dans `ExtractedMemory` avec `trigger`, `sourceTurns`, `payload`
7. Retourne `{ count, memories, trigger, durationMs }`

#### `extractFromMessages()`
1. Reçoit des messages avec `sequence` absolue
2. Construit le prompt depuis ces messages uniquement
3. Même flow extraction + dédup + persist que `extractFromSession()`
4. `sourceTurns` = les sequences des messages fournis

#### Gestion d'erreurs (best-effort)
- JSON invalide retourné par l'LLM → log warning, retourne `{ count: 0 }`
- LLM indisponible → retourne `{ count: 0 }` silencieusement
- Pas de messages / maxMessages=0 → retourne immédiatement `{ count: 0 }`
- **L'extraction ne doit jamais faire échouer un run swarm**

#### Prompt LLM

Envoie un system prompt + les messages de l'agent, demande un JSON array :

```json
[
  {
    "type": "TARGET_FACT|FINDING|USER_PREFERENCE|DECISION|CONSTRAINT",
    "category": "string",
    "title": "string (court, lisible)",
    "payload": { ... },
    "confidence": 0.0-1.0
  }
]
```

Instructions clés :
- Extraire **uniquement** ce qui est observable dans les messages fournis
- Préférer les faits concrets aux suppositions
- Ne pas dupliquer
- `confidence < 1.0` pour les inférences, `1.0` pour les observations directes

---

## 3. Points d'intégration (hooks)

### Hook 1 — `completeTeammate()` (AgentRunner.ts ~L636)

- **Déclencheur :** fin normale d'un agent
- **Quand :** après marquer la task completed, avant l'événement `agent.completed`
- **projectKey :** `pentestId` (requis, sinon skip)
- **completeTeammate devient async**, appelé via `await` dans `runTeammate()`
- try/catch best-effort, non bloquant

```typescript
// Dans completeTeammate(), avant l'émission de l'événement :
if (memoryExtractor && pentestId) {
  try {
    await memoryExtractor.extractFromSession({
      swarmRunId, agentId, pentestId,
      projectKey: pentestId,
      trigger: 'agent_complete',
    });
  } catch (err) { console.error(...); }
}
```

### Hook 2 — Post-compaction (AgentRunner.ts ~L260)

- **Déclencheur :** après compaction réussie, AVANT `storeSummary()`
- **Quand :** quand `estimatedTokens > threshold` et compaction va condenser des messages
- **Capture :** les messages AVANT qu'ils ne soient marqués compactés, avec séquences absolues depuis DB
- **projectKey :** `pentestId` (requis, sinon skip)

```typescript
// Flow dans runTeammate() :
// 1. contextMessages construits
// 2. estimatedTokens > threshold ?
// 3. Capturer les séquences absolues depuis listMessages({ activeOnly: true })
// 4. compactor.compact(...)
// 5. if wasCompacted:
//    a. memoryStore.storeSummary(...)  ← marque messages compactés
//    b. memoryExtractor.extractFromMessages({ messages: compactedWithAbsSequences, ... })
```

### Hook 3 — `SwarmOrchestrator.shutdown()` (~L461)

- **Déclencheur :** shutdown du swarm (fallback uniquement)
- **Garde-fou anti-doublon :** `wasTerminalExtractionDone(swarmRunId, agentId)`
  - Vérifie uniquement `trigger IN ('agent_complete', 'swarm_shutdown')`
  - Un `post_compaction` ne bloque PAS ce fallback
- **projectKey :** `pentestId` strict (pas de fallback sur swarmRunId, pas de projectKey = pas d'extraction)
- **Pas de Prisma inline dans SwarmOrchestrator** — utilise `memoryExtractor.wasTerminalExtractionDone()`

```typescript
// SwarmOrchestrator.shutdown() :
for (const [agentId, info] of this.runningAgents) {
  const projectKey = info.identity.pentestId ?? undefined;
  if (!projectKey) continue;

  if (await memoryExtractor.wasTerminalExtractionDone(info.identity.swarmRunId, agentId)) {
    continue;  // Agent déjà extrait de façon terminale
  }

  await memoryExtractor.extractFromSession({
    swarmRunId: info.identity.swarmRunId,
    agentId,
    pentestId: info.identity.pentestId,
    projectKey,
    trigger: 'swarm_shutdown',
  });
}
```

---

## 4. Injection des dépendances

| Composant | Champ ajouté | Type |
|---|---|---|
| `AgentRunnerConfig` | `memoryExtractor?` | `MemoryExtractor \| undefined` |
| `SwarmOrchestratorDeps` | `memoryExtractor?` | `MemoryExtractor \| undefined` |
| `BuildConfigParams` (AgentRunnerAdapter) | `memoryExtractor?` | `MemoryExtractor \| undefined` |

Tous optionnels — si absent, l'extraction est simplement désactivée (no-op).

---

## 5. API Route (nouveau)

### `GET /api/memories/project/:projectKey`

Retourne les mémoires d'un projet, filtrables.

```
Query params:
  ?type=TARGET_FINDING&limit=20&since=2026-04-01T00:00:00Z

Response:
{
  data: ExtractedMemory[]
}
```

### `GET /api/memories/session/:swarmRunId/:agentId`

Retourne les mémoires extraites pour une session agent spécifique.

---

## 6. Tests

### Unitaires (backend)
1. **MemoryExtractor** — extractFromSession avec mock LLM → valide parsing JSON + persist
2. **MemoryExtractor** — extractFromMessages avec séquences → valide sourceTurns
3. **MemoryExtractor** — déduplication sur (projectKey, title)
4. **MemoryExtractor** — wasTerminalExtractionDone() logic
5. **MemoryExtractor** — gestion erreurs (JSON invalide, LLM down, messages vides)
6. **MemoryExtractor** — listByProject filtrage par type/date

### Intégration (route)
7. **GET /api/memories/project/:projectKey** — retourne les mémoires
8. **GET /api/memories/session/:swarmRunId/:agentId** — retourne par session

### Scénario clé (bug fix validation)
9. **Deux sessions différentes** → mémoires isolées par projectKey
10. **post_compaction + swarm_shutdown** → pas de doublon (garde-fou trigger terminal only)
11. **Pas de projectKey** → aucune extraction, pas de crash

---

## 7. Fichiers

### Nouveaux
| Fichier | Rôle |
|---|---|
| `backend/src/core/memory/MemoryExtractor.ts` | Service d'extraction LLM + persist |
| `backend/src/core/memory/__tests__/MemoryExtractor.test.ts` | Tests unitaires |
| `backend/src/routes/memories.ts` | Route API mémoires |
| `backend/src/routes/__tests__/memories.test.ts` | Tests route |
| `docs/superpowers/specs/2026-04-15-b2-extract-memories-design.md` | Ce spec |

### Modifiés
| Fichier | Changement |
|---|---|
| `backend/prisma/schema.prisma` | Ajout modèle `ExtractedMemory` + enum `MemoryType` |
| `backend/src/core/swarm/AgentRunner.ts` | Hook 1 (completeTeammate async) + Hook 2 (post-compaction) |
| `backend/src/core/swarm/SwarmOrchestrator.ts` | Hook 3 (shutdown fallback) |
| `backend/src/core/runtime/AgentRunnerAdapter.ts` | Propagation `memoryExtractor` dans buildConfig |
| `backend/src/index.ts` | Instanciation MemoryInjector + enregistrement route memories |
| `backend/src/types/fastify.d.ts` | Type memoryExtractor optionnel |

---

## 8. Validation

```bash
# Backend
cd /Users/aris/Documents/LEA/backend && npx tsc --noEmit    # 0 erreurs
cd /Users/aris/Documents/LEA/backend && npx prisma generate  # génère client
cd /Users/aris/Documents/LEA/backend && npm run build      # build OK
cd /Users/aris/Documents/LEA/backend && npx vitest run      # tous tests passent

# Frontend (si contrat modifié)
cd /Users/aris/Documents/LEA/lea-app && npx tsc --noEmit  # 0 erreurs
```

## Critères de fin

- [ ] Modèle ExtractedMemory créé et migré
- [ ] MemoryExtractor service fonctionnel (extraction LLM + persist)
- [ ] 3 hooks intégrés (completeTeammate, post-compaction, shutdown)
- [ ] Déduplication backend fonctionnelle
- [ ] Garde-fou shutdown anti-doublon (trigger terminal only)
- [ ] Route API mémoires fonctionnelle
- [ ] Tests unitaires + intégration + scénario clé
- [ ] 0 erreur TypeScript back + front
- [ ] B2 considéré comme fermé
