# IMPLEMENTATION LOGIQUE CLAUDE

## Objectif

Ce document sert de feuille de route d'implémentation pour rapprocher LEA de la logique de fonctionnement visible dans la copie locale de `claude-code`, en reprenant les briques les plus structurantes et les plus fiables côté architecture.

Le but n'est pas de recopier une UI ou un wording, mais de reconstruire la même logique produit:

- runtime multi-agents robuste
- permissions strictes par outil
- shell sécurisé
- tâches et sous-agents persistants
- mémoire et compaction
- orchestration d'outils
- extensibilité via skills/plugins/MCP
- sessions distantes, reprise, worktrees, checkpoints

## Références globales à consulter

Ces fichiers donnent la structure d'ensemble à garder en tête avant d'attaquer les phases:

- `/Users/aris/Documents/claude-code/src/commands.ts`
- `/Users/aris/Documents/claude-code/src/tools.ts`
- `/Users/aris/Documents/claude-code/src/Tool.ts`
- `/Users/aris/Documents/claude-code/src/query.ts`
- `/Users/aris/Documents/claude-code/src/history.ts`
- `/Users/aris/Documents/claude-code/src/tasks.ts`
- `/Users/aris/Documents/claude-code/src/cost-tracker.ts`
- `/Users/aris/Documents/claude-code/src/interactiveHelpers.tsx`

## Points d'ancrage principaux dans LEA

- `/Users/aris/Documents/LEA/backend/src/routes/pentests.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/swarm.ts`
- `/Users/aris/Documents/LEA/backend/src/core/swarm/AgentSpawner.ts`
- `/Users/aris/Documents/LEA/backend/src/core/swarm/AgentRunner.ts`
- `/Users/aris/Documents/LEA/backend/src/core/permissions/PermissionEngine.ts`
- `/Users/aris/Documents/LEA/backend/src/core/bash/bashPermissions.ts`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts`

## Principe d'implémentation

1. Faire passer LEA d'un produit "swarm pentest scénarisé" à un runtime d'agents généraliste.
2. Brancher toutes les briques sur une boucle centrale stable: prompt utilisateur -> runtime -> outils -> résultats -> UI -> reprise.
3. Construire les fonctionnalités dans un ordre qui évite les réécritures.
4. Prioriser les briques de logique avant les raffinements UX.

## État réel et lecture parallèle (2026-04-26)

Ce document reste la feuille longue d'architecture. Pour exécuter plusieurs sessions Codex en parallèle, utiliser aussi `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`, qui découpe les lots par ownership de fichiers.

Note Session 4: la passe DOCS-01 du 2026-04-26 garde les statuts ci-dessous au niveau architectural. Le snapshot opérationnel, les collisions et les sessions nommées vivent dans `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`.

Note post-stabilisation 2026-04-27: les sessions parallèles ont été intégrées et relues. Le backend build, la suite Vitest backend (`1086 passed`, `1 skipped`), le typecheck frontend, le lint frontend et la suite Vitest frontend (`420 passed`) sont verts. `DOCS-03` synchronise cette feuille avec l'état réel après Session 10, Session 11 et `REPORT-PDF-EXPORT-01`.

Note RC finale 2026-04-28: les huit phases RC de `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md` sont traitées localement. Cette feuille reste une référence d'architecture long terme, pas une promesse MVP client. Les surfaces LSP, skills, plugins, worktrees visibles, plan mode avancé, remote, IDE, voice et marketplace restent internes/expérimentales tant que la validation RC complète n'est pas rejouée sur un environnement propre.

| Bloc | Statut réel | Lecture opérationnelle |
|---|---|---|
| Bloc A - runtime, agents, tasks, permissions, bash, plan, worktrees | DONE / avancé | Les briques runtime existent, sont largement testées et exposées par routes. Le risque restant est surtout l'intégration produit de bout en bout. |
| Bloc B - mémoire, résumés, stats, checkpoints | DONE / avancé | Les services et routes existent. À valider surtout dans le workflow utilisateur complet. |
| Bloc C - tools, hooks, MCP, LSP, search, skills, plugins | PARTIAL / avancé | Registry, discovery, execution API, HookBus, MCP bridge, output capture et UI tools existent. LSP, skills et plugins sont présents mais demandent encore une validation produit. |
| Bloc D - remote, IDE, managed settings, policy, analytics, voice | TODO / partiel | Ne pas lancer avant de stabiliser le MVP pentest complet, sauf lot isolé explicitement assigné. |

Définitions utilisées:

- DONE: implémenté, branché, testé, visible via API ou UI active.
- PARTIAL: code présent mais surface produit ou chemin end-to-end incomplet.
- TODO: absent ou non branché.
- BLOCKED: dépendance externe ou décision produit non résolue.

## Ordre post-stabilisation (DOCS-02)

1. `FRONTEND-LINT-01` et `FRONTEND-LINT-02` sont terminés: le lint frontend global est vert.
2. `MVP-VERIFY-01` est terminé: le flux MVP a été validé via browser-use sur `127.0.0.1`.
3. `REPORT-PDF-EXPORT-01` est terminé: le bug P0 PDF est corrigé et le smoke `/reports` confirme `200 application/pdf` avec fichier `%PDF`.
4. `DEV-RUN-01` et `RESUME-UX-01` sont terminés: le runtime local est aligné sur le proxy PostgreSQL dev et la reprise de scan récent utilise `/pentest?id=...`.
5. Correctif smoke post-MVP: le flux review attend désormais `preflight_state=PASSED` avant `/start`, afin d'éviter la race condition entre résumé preflight et persistance backend.
6. Remote sessions, IDE bridge, policy avancée et voice restent en backlog après le MVP stabilisé.

## Phase RC Stabilization - audit repo GitHub GPT-5.5 Pro (2026-04-27)

Le prochain axe logique n'est plus d'ajouter des capacités Claude Code avancées. LEA entre en stabilisation RC: il faut rendre le MVP pentest fiable, replayable, stoppable et sécurisé autour des modèles déjà présents.

Décision importante: `PentestEvent` existe déjà dans Prisma avec `sequence`; ne pas créer un deuxième event log. Cette table doit devenir la vérité durable du live scan, du replay, du reload et du resume. `SSEManager` doit rester un transport/cache.

Ordre de stabilisation retenu:

1. `RC-EVENTLOG-REPLAY-01`: brancher `PentestEvent` comme source canonique; replay `sinceSeq`, reconnect SSE et reload sans perte.
2. `RC-STREAM-AUTH-CORS-01`: aligner CORS/auth REST et SSE; supprimer les headers stream trop permissifs et résoudre le contrat auth EventSource.
3. `RC-SCOPE-GUARD-01`: rendre le ScopeGuard central et impossible à bypasser par ToolExecutor, MCP/Kali ou Tool Invoke.
4. `RC-STOP-RUN-01`: stop unique du vrai run pentest; cacher pause tant qu'elle n'est pas prouvée fiable.
5. `RC-ACTIVE-PROJECTION-01`: exposer une `PentestRunProjection` produit au lieu de laisser l'UI consommer directement swarm/runtime.
6. `RC-UI-SPLIT-PERF-01`: réduire les god components côté Active Scan après stabilisation du contrat projection/events.
7. `RC-REPORT-EVIDENCE-01`: renforcer preuve -> finding -> export sans refaire le modèle `Finding`, déjà riche.
8. `RC-CUT-EXPERIMENTAL-DOCS-01`: cacher l'expérimental et aligner README/docs/endpoints avec la surface MVP réelle.

Décisions structurantes:

- Source de vérité temporelle: `PentestEvent`; source conversationnelle dérivée: `Message`; preuves outillage: `ToolExecution` + `KaliAuditLog`; état courant: `PentestRunProjection`.
- Ne pas fusionner `PentestOrchestrator` et le runtime swarm maintenant. L'UI MVP ne doit pas consommer `SwarmRun`, `SwarmAgent` ou `RuntimeControl` directement.
- `ToolRegistry`, `ToolExecutor`, `HookBus`, MCP bridge et `RuntimeTaskManager` restent des infrastructures internes, pas des features client à vendre dans le MVP.
- LSP, skills, plugins, remote sessions, IDE bridge, voice, marketplace, worktrees visibles et plan mode avancé sont repoussés après stabilisation.
- `POST /api/tools/:name/invoke` reste admin/dev, feature-flagged, ou fortement protégé par auth, `pentestRunId`, scope serveur et audit.
- Aucun outil pentest ne doit contourner auth, permissions, ScopeGuard, audit log et cancellation.

Risques restants côté logique:

- Le pipeline runtime est largement présent et testé, mais la preuve produit finale reste le parcours pentest complet avec provider réel ou stub contrôlé.
- MCP/LSP/skills/plugins existent techniquement; leur valeur produit doit être validée par usage, pas seulement par présence de routes.
- Les fichiers chauds d'intégration (`backend/src/index.ts`, types Fastify, orchestration pentest) ne doivent plus être modifiés sans lot dédié.

État après `RC-CUT-EXPERIMENTAL-DOCS-01`:

- La surface client est volontairement réduite au flux pentest MVP: providers, création, preflight, live scan, stop, findings, reports et reprise.
- ToolRegistry, ToolExecutor, HookBus, MCP bridge, RuntimeTaskManager, skills, plugins et LSP restent des infrastructures internes/admin.
- La documentation publique est réalignée sur `lea-app`, les exports JSON/HTML/PDF, les flags expérimentaux et les endpoints actuels.
- La prochaine activité logique n'est plus une phase de développement RC, mais une validation release candidate complète et un nettoyage de branche/worktree.

## Pré-requis transversal

Avant les gros lots, il faut assurer le branchement du runtime principal:

| Élément | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Boucle principale session -> outils -> reprise | `/Users/aris/Documents/claude-code/src/query.ts`, `/Users/aris/Documents/claude-code/src/tools.ts`, `/Users/aris/Documents/claude-code/src/Tool.ts` | `/Users/aris/Documents/LEA/backend/src/routes/pentests.ts`, `/Users/aris/Documents/LEA/backend/src/routes/swarm.ts`, `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts`, `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts` | aucune | un prompt utilisateur déclenche une exécution réelle et la session continue après chaque tool call |
| Registre central d'outils | `/Users/aris/Documents/claude-code/src/tools.ts`, `/Users/aris/Documents/claude-code/src/Tool.ts` | nouveau module backend pour registry d'outils, intégration runtime | boucle principale | chaque outil a schéma, permission check, exécution, rendu de résultat |
| Registre central de commandes | `/Users/aris/Documents/claude-code/src/commands.ts`, `/Users/aris/Documents/claude-code/src/commands/*` | backend command router + UI slash command bridge | boucle principale | les slash commands ne sont plus des macros UI locales |

## Phase 1

### Runtime multi-agents, teams, tâches

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Sous-agents persistants | `/Users/aris/Documents/claude-code/src/tools/AgentTool`, `/Users/aris/Documents/claude-code/src/tasks/LocalAgentTask`, `/Users/aris/Documents/claude-code/src/tasks/InProcessTeammateTask`, `/Users/aris/Documents/claude-code/src/tools/shared/spawnMultiAgent.ts` | `/Users/aris/Documents/LEA/backend/src/core/swarm/AgentSpawner.ts`, `/Users/aris/Documents/LEA/backend/src/core/swarm/AgentRunner.ts`, nouveau mapping runtime <-> UI | pré-requis transversal | un agent peut être créé, recevoir un prompt, produire du texte, appeler des tools, rester vivant et reprendre du travail |
| Teams explicites | `/Users/aris/Documents/claude-code/src/tools/TeamCreateTool`, `/Users/aris/Documents/claude-code/src/tools/TeamDeleteTool`, `/Users/aris/Documents/claude-code/src/tools/SendMessageTool` | nouvelle couche `team manager` backend + vue équipe dans LEA | sous-agents persistants | une session peut créer une équipe, lui envoyer des tâches et dissoudre l'équipe |
| Task system complet | `/Users/aris/Documents/claude-code/src/tools/TaskCreateTool`, `/Users/aris/Documents/claude-code/src/tools/TaskGetTool`, `/Users/aris/Documents/claude-code/src/tools/TaskListTool`, `/Users/aris/Documents/claude-code/src/tools/TaskUpdateTool`, `/Users/aris/Documents/claude-code/src/tools/TaskStopTool`, `/Users/aris/Documents/claude-code/src/tasks.ts`, `/Users/aris/Documents/claude-code/src/tasks/*` | nouveau store de tâches backend + API + UI dédiée LEA | sous-agents persistants | chaque tâche a un owner, un état, un output, un arrêt, une reprise, un lien agent |
| Shell tasks en arrière-plan | `/Users/aris/Documents/claude-code/src/tasks/LocalShellTask`, `/Users/aris/Documents/claude-code/src/tools/TaskOutputTool` | `/Users/aris/Documents/LEA/backend/src/core/swarm/ShellTask.ts`, nouveaux endpoints task output | task system | les commandes longues continuent en arrière-plan avec sortie consultable |
| Team messaging réel | `/Users/aris/Documents/claude-code/src/tools/SendMessageTool`, `/Users/aris/Documents/claude-code/src/tasks/InProcessTeammateTask`, `/Users/aris/Documents/claude-code/src/query/stopHooks.ts` | `/Users/aris/Documents/LEA/backend/src/core/swarm/Mailbox.ts`, `/Users/aris/Documents/LEA/backend/src/core/swarm/PermissionBridge.ts` | teams explicites | un agent peut envoyer un message à un autre et recevoir une réponse exploitable |

### Décisions de phase

- Promouvoir `backend/src/core/swarm` comme cœur runtime.
- Réduire la dépendance au modèle plus scripté autour de `PentestSwarm` et `AgentExecutor`.
- Faire converger le produit vers un runtime long-lived, pas juste un exécuteur de templates.

## Phase 2

### Permissions, Bash, Plan mode, Worktree

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Permission engine par outil | `/Users/aris/Documents/claude-code/src/hooks/toolPermission`, `/Users/aris/Documents/claude-code/src/utils/permissions`, `/Users/aris/Documents/claude-code/src/Tool.ts` | `/Users/aris/Documents/LEA/backend/src/core/permissions/PermissionEngine.ts`, `/Users/aris/Documents/LEA/backend/src/core/permissions/PermissionContext.ts` | registre d'outils | chaque outil LEA passe par un check permission unifié et visible |
| BashTool complet | `/Users/aris/Documents/claude-code/src/tools/BashTool/BashTool.tsx`, `/Users/aris/Documents/claude-code/src/tools/BashTool/bashPermissions.ts`, `/Users/aris/Documents/claude-code/src/tools/BashTool/bashSecurity.ts`, `/Users/aris/Documents/claude-code/src/tools/BashTool/commandSemantics.ts`, `/Users/aris/Documents/claude-code/src/tools/BashTool/pathValidation.ts`, `/Users/aris/Documents/claude-code/src/tools/BashTool/destructiveCommandWarning.ts`, `/Users/aris/Documents/claude-code/src/tools/BashTool/sedValidation.ts` | `/Users/aris/Documents/LEA/backend/src/core/bash/*` + intégration runtime effective | permission engine par outil | LEA exécute un shell robuste avec parse, validation, permissions, sandbox, warnings et output stream |
| Plan mode | `/Users/aris/Documents/claude-code/src/tools/EnterPlanModeTool`, `/Users/aris/Documents/claude-code/src/tools/ExitPlanModeTool`, `/Users/aris/Documents/claude-code/src/commands/plan` | `/Users/aris/Documents/LEA/backend/src/core/permissions/types.ts`, UI session LEA | permission engine | un run peut entrer/sortir d'un mode plan qui interdit l'exécution directe |
| Worktree mode | `/Users/aris/Documents/claude-code/src/tools/EnterWorktreeTool`, `/Users/aris/Documents/claude-code/src/tools/ExitWorktreeTool`, `/Users/aris/Documents/claude-code/src/tasks/LocalAgentTask/LocalAgentTask.tsx`, `/Users/aris/Documents/claude-code/src/types/logs.ts` | nouvelle couche git/worktree dans LEA, potentiellement backend + UI session | task system, bash | un agent ou une session peut travailler dans un worktree isolé avec état persistant |
| Commandes slash serveur | `/Users/aris/Documents/claude-code/src/commands/permissions`, `/Users/aris/Documents/claude-code/src/commands/plan`, `/Users/aris/Documents/claude-code/src/commands/tasks`, `/Users/aris/Documents/claude-code/src/commands/agents`, `/Users/aris/Documents/claude-code/src/commands/status`, `/Users/aris/Documents/claude-code/src/commands/cost` | `/Users/aris/Documents/LEA/lea-app/components/chat/slash-command-menu.tsx`, `/Users/aris/Documents/LEA/lea-app/hooks/use-slash-commands.ts`, nouveaux endpoints backend | registre commandes | chaque slash command pilote une action réelle |

### Attention particulière

- Les règles `allow` ne doivent pas court-circuiter les garde-fous shell critiques.
- Le Bash runtime doit être branché réellement dans le runtime, pas rester une librairie interne isolée.

## Phase 3

### Mémoire, compaction, résumés, checkpoints

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Session memory + compaction | `/Users/aris/Documents/claude-code/src/memdir`, `/Users/aris/Documents/claude-code/src/services/SessionMemory`, `/Users/aris/Documents/claude-code/src/services/compact`, `/Users/aris/Documents/claude-code/src/history.ts` | `/Users/aris/Documents/LEA/backend/src/services/context/ContextCompactionService.ts`, `/Users/aris/Documents/LEA/backend/src/services/context/ContextRecallService.ts` | boucle principale | la session garde le contexte long sans explosion de tokens |
| Extract memories | `/Users/aris/Documents/claude-code/src/services/extractMemories`, `/Users/aris/Documents/claude-code/src/services/SessionMemory/prompts.ts` | nouvelle couche extraction mémoire dans LEA | session memory | LEA extrait des faits stables en fin de run ou à des checkpoints |
| Away summary | `/Users/aris/Documents/claude-code/src/services/awaySummary.ts`, `/Users/aris/Documents/claude-code/src/services/toolUseSummary/toolUseSummaryGenerator.ts` | nouveaux résumés UI et backend dans LEA | extract memories | en rouvrant une session, l'utilisateur voit ce qui a changé |
| Checkpoint / rewind | `/Users/aris/Documents/claude-code/src/commands/rewind`, `/Users/aris/Documents/claude-code/src/cli/print.ts`, `/Users/aris/Documents/claude-code/src/history.ts` | nouvelle couche checkpoints + restauration dans LEA | shell tasks, file edit tools | restauration d'un état antérieur de fichiers ou de session |
| Statusline / stats / cost | `/Users/aris/Documents/claude-code/src/commands/status`, `/Users/aris/Documents/claude-code/src/commands/stats`, `/Users/aris/Documents/claude-code/src/commands/cost`, `/Users/aris/Documents/claude-code/src/commands/statusline.tsx`, `/Users/aris/Documents/claude-code/src/cost-tracker.ts` | bandeau session LEA, analytics panel, store runtime | boucle principale | LEA affiche coût, statut, modèle, tâches, activité, pression contexte |

## Phase 4

### Orchestration d'outils, hooks, MCP, LSP

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Tool orchestration + streaming | `/Users/aris/Documents/claude-code/src/services/tools/toolExecution.ts`, `/Users/aris/Documents/claude-code/src/services/tools/toolOrchestration.ts`, `/Users/aris/Documents/claude-code/src/services/tools/StreamingToolExecutor.ts` | nouveau pipeline backend LEA d'exécution d'outils | registre d'outils | chaque tool call suit la même logique d'exécution et de reprise |
| Tool hooks | `/Users/aris/Documents/claude-code/src/services/tools/toolHooks.ts`, `/Users/aris/Documents/claude-code/src/query/stopHooks.ts`, `/Users/aris/Documents/claude-code/src/commands/hooks` | nouveau hook bus LEA | orchestration d'outils | LEA déclenche des hooks `pre`, `post`, `failure`, `task completed`, `teammate idle` |
| MCP first-class | `/Users/aris/Documents/claude-code/src/services/mcp`, `/Users/aris/Documents/claude-code/src/tools/MCPTool`, `/Users/aris/Documents/claude-code/src/tools/McpAuthTool`, `/Users/aris/Documents/claude-code/src/tools/ListMcpResourcesTool`, `/Users/aris/Documents/claude-code/src/tools/ReadMcpResourceTool` | `/Users/aris/Documents/LEA/backend/src/services/mcp/*` et UI settings MCP | orchestration d'outils | MCP n'est plus un bloc spécialisé, mais une surface centrale d'extension |
| LSP first-class | `/Users/aris/Documents/claude-code/src/services/lsp`, `/Users/aris/Documents/claude-code/src/tools/LSPTool` | nouvelle couche LSP côté backend et éventuellement frontend | registre d'outils | LEA peut interroger diagnostics, symboles, serveurs de langage |
| Tool search | `/Users/aris/Documents/claude-code/src/tools/ToolSearchTool`, `/Users/aris/Documents/claude-code/src/services/mcp/officialRegistry.ts` | nouvelle recherche d'outils/plugins/skills dans LEA | MCP first-class, plugins | le runtime peut découvrir et activer des capacités sans hardcode |

## Phase 5

### Skills, plugins, extensibilité

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Skills système | `/Users/aris/Documents/claude-code/src/skills`, `/Users/aris/Documents/claude-code/src/tools/SkillTool`, `/Users/aris/Documents/claude-code/src/commands/skills` | nouveau dossier skills LEA + loader | registre commandes, registre outils | LEA peut exécuter des workflows réutilisables déclarés hors code |
| Bundled skills de base | `/Users/aris/Documents/claude-code/src/skills/bundled` | nouvelles skills LEA pour pentest, review, recon, reporting, batching | skills système | LEA dispose d'un socle de skills natives |
| Plugins système | `/Users/aris/Documents/claude-code/src/services/plugins`, `/Users/aris/Documents/claude-code/src/plugins`, `/Users/aris/Documents/claude-code/src/commands/plugin`, `/Users/aris/Documents/claude-code/src/commands/reload-plugins` | nouveau runtime plugins dans LEA | skills, MCP, LSP | LEA charge et recharge des plugins sans modifier le core |
| Marketplace / trust model | `/Users/aris/Documents/claude-code/src/commands/plugin/PluginTrustWarning.tsx`, `/Users/aris/Documents/claude-code/src/services/plugins/PluginInstallationManager.ts` | UI et backend de confiance plugin | plugins système | plugin install, update, reload, trust/deny |

## Phase 6

### Remote sessions, bridge IDE, surfaces multiples

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Remote sessions | `/Users/aris/Documents/claude-code/src/remote/RemoteSessionManager.ts`, `/Users/aris/Documents/claude-code/src/remote/SessionsWebSocket.ts`, `/Users/aris/Documents/claude-code/src/remote/remotePermissionBridge.ts`, `/Users/aris/Documents/claude-code/src/server/createDirectConnectSession.ts`, `/Users/aris/Documents/claude-code/src/server/directConnectManager.ts` | nouvelle couche remote LEA | runtime multi-agents, permissions | une session LEA peut être suivie et contrôlée à distance |
| Bridge IDE | `/Users/aris/Documents/claude-code/src/bridge/*`, `/Users/aris/Documents/claude-code/src/commands/ide` | nouveau bridge LEA pour éditeur | LSP, remote sessions | LEA peut s'intégrer à un éditeur avec messages, sélections, permissions |
| Mobile / desktop / teleport | `/Users/aris/Documents/claude-code/src/commands/mobile`, `/Users/aris/Documents/claude-code/src/commands/desktop`, `/Users/aris/Documents/claude-code/src/commands/teleport` | surfaces secondaires LEA | remote sessions | LEA expose la session sur d'autres surfaces clientes |

## Phase 7

### Contrôle org, analytics, suggestions, qualité de vie

| Lot | Références `claude-code` | Cibles LEA probables | Dépendances | Critère de fin |
|---|---|---|---|---|
| Remote managed settings | `/Users/aris/Documents/claude-code/src/services/remoteManagedSettings`, `/Users/aris/Documents/claude-code/src/commands/config`, `/Users/aris/Documents/claude-code/src/commands/privacy-settings` | nouvelle couche config centralisée LEA | registre commandes, permissions | certaines règles LEA peuvent être pilotées à distance |
| Policy limits | `/Users/aris/Documents/claude-code/src/services/policyLimits` | nouvelle couche budgets/quotas LEA | remote managed settings | LEA applique des limites coût, outils, modes, domaines |
| Analytics / usage | `/Users/aris/Documents/claude-code/src/services/analytics`, `/Users/aris/Documents/claude-code/src/services/api/usage.ts`, `/Users/aris/Documents/claude-code/src/services/diagnosticTracking.ts` | analytics backend + dashboard LEA | boucle principale | coût, usage, latence, activité agents, approvals sont suivis |
| Prompt suggestions / tips | `/Users/aris/Documents/claude-code/src/services/PromptSuggestion`, `/Users/aris/Documents/claude-code/src/services/tips`, `/Users/aris/Documents/claude-code/src/commands/help` | UX LEA conversation et dashboard | stats, memory, analytics | LEA peut suggérer la prochaine action ou commande |
| Voice | `/Users/aris/Documents/claude-code/src/services/voice.ts`, `/Users/aris/Documents/claude-code/src/services/voiceStreamSTT.ts`, `/Users/aris/Documents/claude-code/src/commands/voice`, `/Users/aris/Documents/claude-code/src/voice` | couche audio LEA optionnelle | remote sessions ou UI locale | dictée vocale fonctionnelle |
| Extras surfaces | `/Users/aris/Documents/claude-code/src/commands/chrome`, `/Users/aris/Documents/claude-code/src/commands/mobile`, `/Users/aris/Documents/claude-code/src/commands/desktop` | facultatif | remote sessions | surfaces complémentaires opérationnelles |

## Ordre d'implémentation recommandé

### Bloc A

1. Pré-requis transversal
2. Runtime multi-agents
3. Tasks
4. Permissions
5. Bash
6. Plan mode
7. Worktree mode

### Bloc B

1. Session memory
2. Extract memories
3. Away summary
4. Statusline / stats / cost
5. Checkpoint / rewind

### Bloc C

1. Tool orchestration
2. Tool hooks
3. MCP
4. LSP
5. Tool search
6. Skills
7. Plugins

### Bloc D

1. Remote sessions
2. Bridge IDE
3. Remote managed settings
4. Policy limits
5. Analytics
6. Prompt suggestions / tips
7. Voice

## Définition de "proche de Claude Code" pour LEA

LEA sera considéré comme suffisamment proche de cette logique si:

- un prompt principal peut déléguer à plusieurs agents durables
- chaque agent peut avoir ses tâches, permissions, messages et outils
- les commandes shell et éditions passent par un vrai pipeline permission/sécurité
- les outils sont tous enregistrés via une même abstraction
- la session est résumable, compactable, checkpointable et reprise
- les extensions se font via skills/plugins/MCP, pas en hardcode
- la session peut être pilotée localement et à distance

## Règles de mise en oeuvre

1. Ne pas implémenter d'abord la cosmétique.
2. Ne pas multiplier les runtimes concurrents dans LEA.
3. Faire converger la logique vers un seul orchestrateur principal.
4. Brancher toute nouvelle brique sur les stores, les events et les permissions dès le début.
5. Favoriser les points de compatibilité simples: registry, hooks, task bus, event bus, permission bus.

## Checklist courte mise à jour

- [-] boucle centrale session branchée - PARTIAL: le pipeline runtime existe, mais le pentest end-to-end doit rester le fil rouge de validation.
- [x] registre d'outils - DONE
- [x] registre de commandes - DONE
- [x] runtime teammates - DONE
- [x] tasks persistantes - DONE
- [x] permissions par outil - DONE
- [x] bash sécurisé branché - DONE
- [x] plan mode - DONE
- [x] worktrees - DONE
- [x] mémoire session - DONE
- [x] extraction de mémoire - DONE
- [x] away summary - DONE
- [x] checkpoints - DONE
- [x] tool orchestration - DONE
- [x] hooks - DONE
- [-] MCP first-class - PARTIAL: bridge MCP -> ToolRegistry et exécution sont branchés; gestion MCP généraliste à durcir.
- [-] LSP first-class - PARTIAL: backend et outils présents; surface produit encore limitée.
- [-] skills - PARTIAL: loader, manager, tool, routes et UI existent; workflows MVP à valider.
- [-] plugins - PARTIAL: manager, trust store, routes et UI existent; installation/reload/trust à durcir.
- [ ] remote sessions - TODO
- [ ] bridge IDE - TODO
- [ ] managed settings - TODO
- [ ] policy limits - TODO
- [-] analytics - PARTIAL: stats/coûts existent; analytics produit complète à cadrer.
- [-] prompt suggestions - PARTIAL: prompts rapides présents; moteur de suggestions contextuelles non finalisé.
- [ ] voice - TODO
