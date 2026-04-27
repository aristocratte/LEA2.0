# ROADMAP ACTIVE LEA

## Rôle du document

Ce fichier est la carte d'exécution quotidienne pour paralléliser le développement de LEA. Les deux fichiers historiques restent les roadmaps longues:

- `/Users/aris/Documents/LEA/IMPLEMENTATION-LOGIQUE-CLAUDE.md`
- `/Users/aris/Documents/LEA/IMPLEMENTATION-UI-CLAUDE.md`

Ici, l'objectif est différent: permettre d'ouvrir plusieurs sessions Codex sans collision, avec un périmètre clair, des fichiers propriétaires, des dépendances et une vérification attendue.

## Définitions de statut

| Statut | Définition |
|---|---|
| DONE | Implémenté, branché, testé, visible via API ou UI active. |
| PARTIAL | Code présent, mais expérience produit, intégration ou validation end-to-end incomplète. |
| TODO | Absent ou non branché. |
| BLOCKED | Dépendance externe ou décision produit non résolue. |

## Objectif MVP prioritaire

Le MVP utile de LEA n'est pas "avoir toutes les briques Claude Code". Le MVP est un pentest réellement exécutable et exploitable:

1. Configurer un provider et un modèle.
2. Créer un pentest avec target, scope, modèle et effort.
3. Lancer le preflight dans le même flux, sans écran artificiel inutile.
4. Démarrer le scan de façon fiable.
5. Voir les messages, outils, erreurs et sorties longues en live.
6. Générer des findings vérifiables.
7. Relire, éditer et valider les findings.
8. Exporter un rapport.
9. Reprendre une session récente sans perdre le contexte.

Tant que ce flux n'est pas stable, remote sessions, voice, marketplace et IDE bridge restent secondaires.

## État réel synthétique

| Zone | Statut | Commentaire |
|---|---|---|
| Backend Bloc A - runtime, agents, tasks, permissions, bash, plan, worktrees | DONE / avancé | Les routes et core modules existent. Le risque principal est l'intégration E2E plutôt que l'absence de code. |
| Backend Bloc B - mémoire, away summary, stats, checkpoints | DONE / avancé | Les briques sont présentes. À valider dans le parcours pentest réel. |
| Backend Bloc C - tools, hooks, MCP, LSP, skills, plugins | PARTIAL / avancé | ToolRegistry, ToolExecutor, HookBus, MCP bridge, tool search et execution API sont en place. Skills/plugins/LSP demandent une validation produit. |
| Backend Bloc D - remote, IDE, policy, voice | TODO / partiel | À ne pas prioriser avant le MVP pentest. |
| UI Bloc A - shell, workspace, input, status, search | PARTIAL / avancé | Shell moderne et workspace actifs. Il reste à unifier l'expérience et supprimer les restes d'ancienne UI. |
| UI Bloc B - permissions, agents, tasks, review | PARTIAL / avancé | Panneaux présents. États actifs, empty states, erreurs et densité UX à polir. |
| UI Bloc C - runtime extensions | PARTIAL | Console settings visible, mais encore à transformer en outil produit clair. |
| UI Bloc D - reports, resume, remote, IDE, voice | PARTIAL / TODO | Reports partiel, resume partiel, remote/IDE/voice à plus tard. |

## Snapshot de coordination - Session 4 (2026-04-26)

`git status --short` au lancement de Session 4 montre un workspace déjà très modifié: 211 entrées non commit, réparties entre `backend` (70), `lea-app` (124), racine (14), `docs` (2) et `e2e` (1). Les trois fichiers DOCS-01 sont eux-mêmes non suivis dans ce snapshot.

Points de coordination immédiats:

- Les fichiers chauds `/Users/aris/Documents/LEA/backend/src/index.ts`, `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts`, `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx`, `/Users/aris/Documents/LEA/lea-app/store/pentest-store.ts` et `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts` apparaissent déjà modifiés.
- `WORKSPACE-UI-01` reste conditionnel: ne le lancer que si `PENTEST-E2E-01` ne touche pas `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`.
- `DOCS-01` est le seul workstream autorisé à modifier cette roadmap et les deux feuilles longues pendant Session 4.

## Snapshot de coordination - Post sessions parallèles (2026-04-27)

Les sessions `PENTEST-E2E-01`, `REPORTS-FINDINGS-01`, `PROVIDERS-01`, `SECURITY-OPS-01`, `WORKSPACE-UI-01` et `RUNTIME-EXT-01` ont été passées puis relues. Les validations d'intégration les plus récentes indiquent:

- Backend: `npm run build` OK, suite complète Vitest `1086 passed`, `1 skipped`.
- Frontend: `npm run typecheck` OK, suite complète Vitest `420 passed`.
- Frontend lint: `npm run lint -- --quiet` OK après `FRONTEND-LINT-02`, Session 10.
- MVP validation: Session 11 a validé le flux complet sur `127.0.0.1`; seul l'export PDF a échoué puis a été corrigé par `REPORT-PDF-EXPORT-01`.
- Infra: `bash -n start.sh`, `docker compose config --quiet` et `git diff --check` OK sur les fichiers touchés.
- Lint frontend global: corrigé par `FRONTEND-LINT-01` puis `FRONTEND-LINT-02`; `55` erreurs restantes de Session 9 résolues par Session 10.

Points importants:

- Ne pas relancer `DOCS-01`; `DOCS-02` est la passe documentaire post-stabilisation de référence.
- `FRONTEND-LINT-01` et `FRONTEND-LINT-02` sont terminés; ESLint frontend global est maintenant vert.
- `MVP-VERIFY-01` est terminé côté validation; le bug P0 découvert sur l'export PDF est couvert par `REPORT-PDF-EXPORT-01`.
- Les corrections récentes ont touché des fichiers chauds (`backend/src/index.ts`, `lea-app/app/pentest/page.tsx`, Docker/start). Ne pas les modifier à nouveau sans relire le diff actuel.

## Plan RC Stabilization - décision GPT-5.5 Pro (2026-04-27)

**Verdict retenu:** LEA est techniquement avancé, mais pas encore MVP commercialisable tant que le live scan, la source de vérité des événements, stop/cancel et les gates sécurité ne sont pas prouvés sur un parcours continu.

**Règle de phase:** freeze nouvelles features. Les prochains lots doivent stabiliser le MVP pentest, pas étendre LSP/skills/plugins/remote/voice.

### Ordre recommandé

| Ordre | Workstream | Priorité | Statut | Dépendances | Décision |
|---:|---|---|---|---|---|
| 1 | `RC-RUN-EVENTLOG-01` | P0 | TODO | aucune | Créer une source canonique `runId + seq` pour events, replay REST et SSE reconnectable. |
| 2 | `RC-SECURITY-GATES-01` | P0 | TODO | aucune, mais lock backend runtime/security | Durcir auth, scope, Tool Invoke API, MCP/Kali, permission deny en `403`. |
| 3 | `RC-STOP-CANCEL-01` | P0 | TODO | coordination avec security/runtime | Stop fiable sur le vrai `PentestRun`; cacher pause si non prouvée. |
| 4 | `RC-LIVE-PERF-01` | P0 | TODO | idéalement après event log | Empêcher freezes: batching, virtualisation/fenêtre DOM, polling réduit, store subscriptions propres. |
| 5 | `RC-RUNTIME-PROJECTION-01` | P0/P1 | TODO | après event log/perf si possible | Remplacer panels faux/vides par projection produit fiable: status, activity, tools, findings, errors. |
| 6 | `RC-CREATION-PREFLIGHT-01` | P1 | TODO | aucune forte | State machine new scan; start impossible avant `PREFLIGHT_PASSED`; retry clair. |
| 7 | `RC-REPORT-EVIDENCE-01` | P1 | TODO | idéalement après event log | Findings avec preuves, statut draft/validated/rejected, exports conservant evidence. |
| 8 | `RC-RESUME-PERSISTENCE-01` | P1 | TODO | après event log | Resume fiable des runs running/stopped/completed via projection + replay. |
| 9 | `RC-CUT-LEGACY-UI-DOCS-01` | P1/P2 | TODO | après stabilisation UX principale | Cacher experimental, supprimer legacy visible, aligner docs et surface MVP. |

### Critères MVP non négociables

- Le flux target -> scope -> config -> review -> preflight -> scan -> findings -> report passe plusieurs fois sans intervention dev.
- Aucun message live déjà visible ne disparaît après snapshot REST, reconnect SSE ou reload.
- Reload pendant scan restaure l'historique et reprend le live.
- Stop fonctionne pendant preflight, outil long-running et génération IA; aucun nouvel outil ne démarre après stop.
- Toutes les exécutions d'outils passent par auth, permissions et scope guard en mode SaaS.
- Tool Invoke API est admin/dev only ou protégée par auth forte + `pentestRunId` + scope; deny/ask retourne `403`.
- Active Scan n'affiche plus de panels/compteurs faux (`Agents 0`, `Tasks 0`) pendant un scan réel.
- Findings exportés sont vérifiables ou clairement marqués draft/non validés.
- Reports JSON/HTML/PDF fonctionnent avec multiline, unicode, longues preuves et findings édités.
- Runtime extensions, LSP, skills, plugins, hooks et tool invoke manuel sont cachés ou marqués experimental hors MVP client.

### Cut list MVP

- Cacher derrière feature flag: Agents avancés, Teams, Skills, Plugins, LSP, Hooks, Runtime extensions, ToolBrowser complet, Tool Invoke UI, Worktrees, Plan mode avancé, Remote sessions, IDE bridge, Voice, Marketplace.
- Supprimer ou masquer immédiatement: ancien workflow de création s'il réapparaît, ancien header/nav, panels vides/faux, follow-up prompt pendant scan actif, toute route/UI qui promet une action runtime non alimentée par le flux pentest.
- Garder en interne: ToolRegistry, ToolExecutor, HookBus, MCP bridge, core swarm générique, RuntimeTaskManager.

### Locks de parallélisation RC

- `RC-RUN-EVENTLOG-01`, `RC-LIVE-PERF-01`, `RC-RUNTIME-PROJECTION-01` et `RC-RESUME-PERSISTENCE-01` ne doivent pas éditer simultanément `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts`, `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts`, `/Users/aris/Documents/LEA/backend/src/services/SSEManager.ts`.
- `RC-SECURITY-GATES-01` et `RC-STOP-CANCEL-01` ne doivent pas éditer simultanément `/Users/aris/Documents/LEA/backend/src/index.ts`, `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts`, `/Users/aris/Documents/LEA/backend/src/routes/pentests.ts`, `/Users/aris/Documents/LEA/backend/src/services/PentestOrchestrator.ts`, `/Users/aris/Documents/LEA/backend/src/services/PentestAgent.ts`.
- `RC-CUT-LEGACY-UI-DOCS-01` doit être lancé après les lots UI/runtime principaux, pas avant.

## Règles de parallélisation

1. Une session Codex = un workstream.
2. Une session Codex possède ses fichiers. Elle ne touche pas aux fichiers d'un autre workstream.
3. Avant d'éditer, chaque session lance `git status --short` et lit les fichiers qu'elle possède.
4. Chaque session doit annoncer son ownership dans son premier message.
5. Pas de refactor transversal sans coordination explicite.
6. Les fichiers chauds ne doivent être modifiés que par une seule session à la fois.
7. Chaque session finit avec les tests ciblés de sa zone et la liste des risques restants.

## Fichiers chauds à verrouiller

Ces fichiers provoquent facilement des conflits. Ne les donner qu'à une session à la fois.

| Fichier | Pourquoi il est chaud |
|---|---|
| `/Users/aris/Documents/LEA/backend/src/index.ts` | Point d'intégration de toutes les routes et décorations Fastify. |
| `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts` | Types globaux Fastify partagés par beaucoup de routes. |
| `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx` | Surface principale active scan. |
| `/Users/aris/Documents/LEA/lea-app/store/pentest-store.ts` | État central pentest. |
| `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts` | Projection runtime agents/messages/tasks. |
| `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts` | Flux SSE, donc impact direct sur le workflow live. |
| `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx` | Providers, modèles, settings runtime. |

## Workstreams parallélisables

### DOCS-01 - Source de vérité roadmap

**Statut:** PARTIAL / maintenance active. La passe Session 4 du 2026-04-26 est terminée, mais cette roadmap reste la source de vérité à ajuster pendant les dispatchs parallèles.

**Ownership:**

- `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`
- `/Users/aris/Documents/LEA/IMPLEMENTATION-LOGIQUE-CLAUDE.md`
- `/Users/aris/Documents/LEA/IMPLEMENTATION-UI-CLAUDE.md`

**Objectif:** garder les statuts réels à jour et préparer les prompts de dispatch.

**Ne pas toucher:** code backend, code frontend.

**Vérification:** lecture Markdown et cohérence avec `git status --short`.

### DOCS-02 - Synchronisation post-stabilisation

**Statut:** DONE le 2026-04-27, Session 8. À relancer seulement après une nouvelle passe de stabilisation.

**Ownership:**

- `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`
- `/Users/aris/Documents/LEA/IMPLEMENTATION-LOGIQUE-CLAUDE.md`
- `/Users/aris/Documents/LEA/IMPLEMENTATION-UI-CLAUDE.md`

**Objectif:** mettre à jour les trois documents avec l'état réel après les sessions parallèles et la passe de correction finale: validations vertes, risques restants, nouveaux workstreams, dépendances et ordre conseillé.

**État synchronisé par DOCS-02:**

- Les validations post-stabilisation à considérer comme source de vérité sont: backend build OK, backend Vitest `1086 passed`, `1 skipped`, frontend typecheck OK, frontend lint OK, frontend Vitest `420 passed`, infra/syntax Docker et shell OK.
- Le risque qualité `FRONTEND-LINT-02` est résolu depuis Session 10: le lint frontend global passe à `0` erreur.
- `REPORT-PDF-EXPORT-01` a corrigé le bug P0 PDF découvert par `MVP-VERIFY-01`; smoke post-fix OK sur `/reports`, bouton PDF, endpoint `200 application/pdf` et fichier `%PDF`.
- Les anciens lots fonctionnels ne doivent pas être relancés en bloc. En cas de gap, créer un lot de correction ciblé avec ownership explicite.

**Ne pas toucher:** code backend, code frontend, Docker, scripts.

**Vérification:**

- `git status --short`
- `rg -n "DOCS-03|FRONTEND-LINT-02|REPORT-PDF-EXPORT-01|1086 passed|420 passed" ROADMAP-ACTIVE.md IMPLEMENTATION-LOGIQUE-CLAUDE.md IMPLEMENTATION-UI-CLAUDE.md`
- Relecture Markdown ciblée des sections modifiées.

### PENTEST-E2E-01 - Workflow pentest fiable

**Statut:** priorité P0.

**Ownership backend:**

- `/Users/aris/Documents/LEA/backend/src/routes/pentests.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/swarm.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/stream.ts`
- `/Users/aris/Documents/LEA/backend/src/services/PentestOrchestrator.ts`
- `/Users/aris/Documents/LEA/backend/src/services/PentestAgent.ts`
- `/Users/aris/Documents/LEA/backend/src/services/SSEManager.ts`
- `/Users/aris/Documents/LEA/backend/src/services/PreflightService.ts`

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/scope/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/config/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/review/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/preflight-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/active-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/complete-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts`
- `/Users/aris/Documents/LEA/lea-app/store/pentest-creation-store.ts`

**Objectif:** transformer la création de scan en flux continu: target -> scope -> config -> review -> preflight inline -> run -> stream.

**Ne pas toucher sans coordination:** `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts`.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npm run build`
- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/routes/__tests__/pentests.test.ts src/routes/__tests__/swarm.test.ts src/services/__tests__/PreflightService.test.ts`
- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`
- Browser-use: créer un scan sur un domaine autorisé et vérifier preflight + lancement + stream.

### REPORTS-FINDINGS-01 - Findings et rapports MVP

**Statut:** priorité P0.

**Ownership backend:**

- `/Users/aris/Documents/LEA/backend/src/routes/reports.ts`
- `/Users/aris/Documents/LEA/backend/src/services/FindingsAgent.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/__tests__/reports.test.ts`

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/app/reports/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmFindingsTable.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/FindingEditModal.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/ReviewSummary.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/chat/export-conversation.tsx`

**Objectif:** findings relisibles, éditables, exportables, avec un rapport MVP crédible.

**Ne pas toucher:** provider settings, runtime tools, active workspace hors composants findings/reports.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/routes/__tests__/reports.test.ts`
- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`
- Browser-use: ouvrir `/reports`, vérifier navigation sidebar, liste, états vides et export.

### REPORT-PDF-EXPORT-01 - Robustesse export PDF

**Statut:** DONE, correction post `MVP-VERIFY-01`.

**Ownership backend:**

- `/Users/aris/Documents/LEA/backend/src/services/ExportService.ts`
- `/Users/aris/Documents/LEA/backend/src/services/__tests__/ExportService.test.ts`

**Objectif:** corriger le `500` sur `GET /api/reports/:id/export/pdf` quand le rapport contient du texte multiligne ou Markdown-like dans le résumé exécutif, la description ou la remédiation d'un finding.

**Cause racine:** `pdf-lib` ne peut pas mesurer/dessiner une chaîne contenant `\n` avec les polices standard WinAnsi. `ExportService.wrapText()` envoyait parfois des retours ligne bruts à `widthOfTextAtSize()` puis `drawText()`.

**Correction:** normalisation CRLF/LF avant mesure et dessin, wrapping paragraphe par paragraphe, conservation des lignes vides sans envoyer `\n` à pdf-lib.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/services/__tests__/ExportService.test.ts`: test rouge reproduit d'abord `WinAnsi cannot encode "\n"`, puis passe après correction.
- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/routes/__tests__/reports.test.ts src/services/__tests__/ExportService.test.ts`: OK, `7` tests.
- `cd /Users/aris/Documents/LEA/backend && npm run build`: OK.
- `cd /Users/aris/Documents/LEA/backend && npx vitest run`: OK, `85` fichiers, `1086` tests, `1` skipped.
- Browser/API smoke post-fix: `/reports` charge avec les rapports locaux, bouton `PDF` disponible, `GET /api/reports/:id/export/pdf` retourne `200 application/pdf` et un fichier commençant par `%PDF`.
- `cd /Users/aris/Documents/LEA && git diff --check -- backend/src/services/ExportService.ts backend/src/services/__tests__/ExportService.test.ts ROADMAP-ACTIVE.md`: OK.

### PROVIDERS-01 - Providers, modèles, effort de raisonnement

**Statut:** priorité P0.

**Ownership backend:**

- `/Users/aris/Documents/LEA/backend/src/services/ProviderManager.ts`
- `/Users/aris/Documents/LEA/backend/src/services/ai/ZhipuClient.ts`
- `/Users/aris/Documents/LEA/backend/src/services/ZaiModelCatalog.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/providers.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/__tests__/providers.test.ts`
- `/Users/aris/Documents/LEA/backend/src/services/__tests__/ProviderManager.test.ts`
- `/Users/aris/Documents/LEA/backend/src/services/ai/__tests__/ZhipuClient.test.ts`

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/ModelSelector.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/ThinkingBudgetControl.tsx`
- `/Users/aris/Documents/LEA/lea-app/lib/provider-defaults.ts`
- `/Users/aris/Documents/LEA/lea-app/lib/model-capabilities.ts`
- `/Users/aris/Documents/LEA/lea-app/store/provider-store.ts`

**Objectif:** providers testables, modèles à jour, effort de raisonnement proposé seulement quand le modèle le supporte.

**Ne pas toucher:** workflow pentest hors modèle/config, rapports.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/routes/__tests__/providers.test.ts src/services/__tests__/ProviderManager.test.ts src/services/ai/__tests__/ZhipuClient.test.ts`
- `cd /Users/aris/Documents/LEA/lea-app && npx vitest run lib/__tests__/provider-defaults.test.ts lib/__tests__/model-capabilities.test.ts components/pentest/__tests__/ModelSelector.test.tsx components/pentest/__tests__/ThinkingBudgetControl.test.tsx`
- Browser-use: `/settings`, ajouter/tester provider, vérifier couleurs input et endpoint par défaut.

### WORKSPACE-UI-01 - Active scan UX polish

**Statut:** priorité P1, peut tourner en parallèle si `PENTEST-E2E-01` ne touche pas `page.tsx`.

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/AgentPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/TeamPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/TaskPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/ToolBrowser.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/SkillsPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/StatusBar.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/MessageInbox.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/chat-messages.tsx`

**Objectif:** une surface active scan professionnelle: panneaux lisibles, states propres, plus de wording Nia, pas d'ancienne UI.

**Ne pas toucher:** backend, providers, reports.

**Vérification:**

- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`
- `cd /Users/aris/Documents/LEA/lea-app && npx vitest run components/pentest/__tests__/AgentPanel.test.tsx components/pentest/__tests__/TeamPanel.test.tsx components/pentest/__tests__/TaskPanel.test.tsx components/pentest/__tests__/ToolBrowser.test.tsx components/pentest/__tests__/SkillsPanel.test.tsx`
- Browser-use: ouvrir un scan actif et vérifier les onglets agents, teams, tasks, tools, skills.

### RUNTIME-EXT-01 - Skills, plugins, LSP productization

**Statut:** priorité P2.

**Ownership backend:**

- `/Users/aris/Documents/LEA/backend/src/core/skills`
- `/Users/aris/Documents/LEA/backend/src/core/plugins`
- `/Users/aris/Documents/LEA/backend/src/core/lsp`
- `/Users/aris/Documents/LEA/backend/src/routes/skills.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/plugins.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/lsp.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/mcp.ts`
- `/Users/aris/Documents/LEA/backend/src/routes/hooks.ts`

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/components/settings/RuntimeExtensionsPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-runtime-extensions.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-skills.ts`
- `/Users/aris/Documents/LEA/lea-app/lib/extensions-api.ts`
- `/Users/aris/Documents/LEA/lea-app/lib/skills-api.ts`

**Objectif:** faire passer runtime extensions de "présent techniquement" à "compréhensible et utilisable".

**Ne pas toucher:** active scan core, providers, reports.

**Règle opérationnelle routes globales:** ne pas modifier `/Users/aris/Documents/LEA/backend/src/index.ts` ni `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts` dans ce lot. Si `RUNTIME-EXT-01` a besoin d'enregistrer une route ou une décoration Fastify globale, arrêter et coordonner avec `SECURITY-OPS-01`, propriétaire de ces deux fichiers chauds.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npx vitest run src/routes/__tests__/skills.test.ts src/core/skills/__tests__/SkillTool.test.ts src/core/plugins/__tests__/PluginManager.test.ts src/core/lsp/__tests__/LspAnalysisService.test.ts`
- `cd /Users/aris/Documents/LEA/lea-app && npx vitest run components/settings/__tests__/RuntimeExtensionsPanel.test.tsx hooks/__tests__/use-runtime-extensions.test.ts hooks/__tests__/use-skills.test.ts`

### SECURITY-OPS-01 - Durcissement commercial minimal

**Statut:** priorité P1/P2 selon objectif release.

**Ownership:**

- `/Users/aris/Documents/LEA/.env.example`
- `/Users/aris/Documents/LEA/docker-compose.yml`
- `/Users/aris/Documents/LEA/start.sh`
- `/Users/aris/Documents/LEA/backend/src/index.ts`
- `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts`
- routes ou middleware sécurité dédiés si créés

**Objectif:** rendre le démarrage, la config, l'audit et les garde-fous acceptables pour un produit commercial.

**Ne pas toucher:** UI métier, providers, reports, runtime extension internals.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npm run build`
- `cd /Users/aris/Documents/LEA/backend && npx vitest run`
- Démarrage Docker local si le lot modifie Docker ou scripts.

### FRONTEND-LINT-01 - Nettoyage ESLint global, passe 1

**Statut:** DONE dans son périmètre, Session 9. Les `55` erreurs restantes hors ownership initial ont ensuite été résolues par `FRONTEND-LINT-02`.

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/app/demo/welcome/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/review/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/pentest/new/review/page.test.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/chat/message-actions-context.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/chat/notification-center.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/chat/search-modal.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/layout/theme-toggle.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/network-status.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/onboarding/WelcomeScreen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/AgentSwarmLiveView.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/CostEstimator.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/PermissionRequestDialog.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/__tests__/TargetInput.test.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/__tests__/TeamPanel.test.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/__tests__/ToolBrowser.test.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-scan-history.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-session-stats.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-slash-commands.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-swarm-store.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-toast.ts`
- `/Users/aris/Documents/LEA/lea-app/store/__tests__/swarm-store.test.ts`
- `/Users/aris/Documents/LEA/lea-app/store/provider-store.ts`
- `/Users/aris/Documents/LEA/lea-app/types/index.ts`

**Objectif:** réduire le lint global sans refactor produit sur le premier lot de fichiers autorisés. Corriger prioritairement les erreurs, pas tous les warnings.

**Ne pas toucher sans coordination:**

- `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/reports/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/AgentPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/TaskPanel.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/SkillsPanel.tsx`

**Vérification:**

- `cd /Users/aris/Documents/LEA/lea-app && npm run lint -- --quiet`
- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`
- Tests ciblés selon fichiers modifiés. Au minimum si hooks/stores changent: `cd /Users/aris/Documents/LEA/lea-app && npx vitest run hooks/__tests__/use-slash-commands.test.ts hooks/__tests__/useDraftPentest.test.ts store/__tests__/swarm-store.test.ts`

### FRONTEND-LINT-02 - Nettoyage ESLint global, passe finale

**Statut:** DONE, Session 10. Le lint frontend global est vert.

**Ownership frontend:**

- `/Users/aris/Documents/LEA/lea-app/components/pentest/active-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/complete-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/preflight-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/swarm-ui-components.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/terminal-block.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/ui/textarea.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-activity-feed.ts`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-history.ts`

**Objectif:** faire passer `cd /Users/aris/Documents/LEA/lea-app && npm run lint -- --quiet` à 0 erreur en corrigeant les `55` erreurs restantes, sans refactor produit ni changement UX non demandé.

**Erreurs attendues au départ:**

- `components/pentest/active-screen.tsx`: `27` `no-explicit-any`
- `components/pentest/complete-screen.tsx`: `3` `react/no-unescaped-entities`
- `components/pentest/preflight-screen.tsx`: `17` erreurs
- `components/pentest/swarm-ui-components.tsx`: `1` `set-state-in-effect`
- `components/pentest/terminal-block.tsx`: `2` `prefer-const`
- `components/ui/textarea.tsx`: `1` `no-empty-object-type`
- `hooks/use-activity-feed.ts`: `2` `react-hooks/purity`
- `hooks/use-pentest-history.ts`: `2` `no-explicit-any`

**Ne pas toucher sans coordination:**

- Les fichiers modifiés par `FRONTEND-LINT-01`, sauf si une erreur lint restante les implique explicitement.
- `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/app/reports/page.tsx`

**Vérification:**

- `cd /Users/aris/Documents/LEA/lea-app && npm run lint -- --quiet`: OK, `0` erreur.
- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`: OK.
- `cd /Users/aris/Documents/LEA/lea-app && npx vitest run lib/runtime/__tests__/activity-feed.assertions.test.ts components/pentest/__tests__/AgentSwarmLiveView.test.tsx`: OK, `2` fichiers, `6` tests.
- `cd /Users/aris/Documents/LEA && git diff --check -- lea-app/components/pentest/active-screen.tsx lea-app/components/pentest/complete-screen.tsx lea-app/components/pentest/preflight-screen.tsx lea-app/components/pentest/swarm-ui-components.tsx lea-app/components/pentest/terminal-block.tsx lea-app/components/ui/textarea.tsx lea-app/hooks/use-activity-feed.ts lea-app/hooks/use-pentest-history.ts`: OK.

### MVP-VERIFY-01 - Validation release candidate pentest

**Statut:** DONE côté validation, Session 11. Bug P0 PDF identifié puis corrigé dans `REPORT-PDF-EXPORT-01`.

**Ownership:**

- Aucun fichier par défaut. Ce lot est une validation lecture/tests/browser-use.
- Si une correction est nécessaire, arrêter et créer un workstream dédié avec ownership explicite avant d'éditer.

**Objectif:** valider le MVP pentest complet sur l'état post-stabilisation: configuration provider, création target/scope/config/review, preflight inline, lancement fiable, stream live, findings, édition/review et export rapport.

**Résultat Session 11:**

- Backend build OK.
- Backend Vitest OK en Session 11: `84` fichiers, `1084` tests; post `REPORT-PDF-EXPORT-01`: `85` fichiers, `1086` tests, `1` skipped.
- Frontend lint OK.
- Frontend typecheck OK.
- Frontend Vitest OK: `48` fichiers, `416` tests.
- Browser-use OK sur cible autorisée `127.0.0.1`: provider, target, scope, config, review, preflight inline, lancement scan, stream live, findings, stop scan, ouverture rapport, export JSON/HTML/PDF.
- Correctif post-smoke: la page review attend maintenant `preflight_state=PASSED` avant d'appeler `/start`, ce qui évite la race condition où le résumé preflight arrive avant la persistance de l'état final.
- Écart trouvé: export PDF `500`, corrigé dans `REPORT-PDF-EXPORT-01`.

**Dépendances:**

- `DOCS-03` terminé pour utiliser cette roadmap à jour après `REPORT-PDF-EXPORT-01`.
- `FRONTEND-LINT-01` et `FRONTEND-LINT-02` terminés si l'objectif est une release candidate propre côté CI.

**Ne pas toucher:** code backend, code frontend, Docker, scripts, documents de roadmap sauf nouveau lot explicitement assigné.

**Vérification:**

- `cd /Users/aris/Documents/LEA/backend && npm run build`
- `cd /Users/aris/Documents/LEA/backend && npx vitest run`
- `cd /Users/aris/Documents/LEA/lea-app && npm run typecheck`
- `cd /Users/aris/Documents/LEA/lea-app && npx vitest run`
- Browser-use: parcourir le flux MVP complet sur un domaine autorisé et vérifier preflight, lancement, stream, findings, review et export.

## Matrice de collision

| Workstream A | Workstream B | Risque | Règle |
|---|---|---|---|
| PENTEST-E2E-01 | WORKSPACE-UI-01 | Très élevé | Ne pas modifier `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx` dans les deux sessions. |
| PENTEST-E2E-01 | WORKSPACE-UI-01 | Élevé | `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-stream.ts` appartient explicitement à `PENTEST-E2E-01`; `WORKSPACE-UI-01` ne doit pas le modifier sans coordination. |
| PENTEST-E2E-01 | PROVIDERS-01 | Moyen | Le wizard config peut dépendre des modèles; coordonner avant de toucher `/pentest/new/config`. |
| REPORTS-FINDINGS-01 | WORKSPACE-UI-01 | Moyen | Findings/review dans active scan peuvent croiser les panneaux UI. |
| RUNTIME-EXT-01 | SECURITY-OPS-01 | Élevé | `SECURITY-OPS-01` possède `/Users/aris/Documents/LEA/backend/src/index.ts` et `/Users/aris/Documents/LEA/backend/src/types/fastify.d.ts`; `RUNTIME-EXT-01` reste sur ses routes dédiées sauf coordination explicite. |
| Tous | DOCS-01 | Faible | DOCS-01 ne touche pas au code. |
| Tous | DOCS-02 | Faible | DOCS-02 ne touche pas au code. |
| FRONTEND-LINT-01 | WORKSPACE-UI-01 | Moyen | FRONTEND-LINT-01 évite les fichiers polish actifs listés en exclusion sauf coordination. |
| FRONTEND-LINT-02 | PENTEST-E2E-01 | Élevé | FRONTEND-LINT-02 possède `active-screen`, `preflight-screen` et `complete-screen`; ne pas lancer en parallèle avec un correctif workflow sur ces fichiers. |
| FRONTEND-LINT-02 | WORKSPACE-UI-01 | Moyen | FRONTEND-LINT-02 reste limité aux corrections lint et ne doit pas repolir les panels. |
| MVP-VERIFY-01 | Tous | Faible tant qu'il reste validation-only | Si un bug est trouvé, ouvrir un lot de correction dédié au lieu d'éditer pendant la validation. |

## Prompts prêts à envoyer

### Prompt générique

```text
Tu es sur LEA dans /Users/aris/Documents/LEA. Prends uniquement le workstream [NOM].

Nom de cette session: [SESSION]

Ownership strict:
[COLLER LES FICHIERS DU WORKSTREAM]

Ne touche pas:
[COLLER LES EXCLUSIONS]

Objectif:
[COLLER L'OBJECTIF]

Contraintes:
- Commence par git status --short.
- Lis les fichiers propriétaires avant d'éditer.
- N'utilise pas de refactor transversal.
- N'annule aucune modification existante.
- Chaque ligne modifiée doit servir l'objectif.

Vérification obligatoire:
[COLLER LES COMMANDES DE VÉRIFICATION]

À la fin, rends:
- fichiers modifiés
- tests lancés et résultat
- risques restants
- ce qu'une autre session ne doit pas modifier sans coordination
```

### Dispatch recommandé maintenant

1. Session 8: `DOCS-02` terminée, documents synchronisés avec l'état post-stabilisation.
2. Session 9: `FRONTEND-LINT-01` terminée dans son périmètre, `55` erreurs restantes hors ownership initial.
3. Session 10: `FRONTEND-LINT-02` terminée, ESLint frontend global vert.
4. Session 11: `MVP-VERIFY-01` terminée; flux MVP validé, bug PDF identifié.
5. Correctif post-validation: `REPORT-PDF-EXPORT-01` terminé.
6. Correctifs locaux intégrés ensuite: `DEV-RUN-01` et `RESUME-UX-01` terminés.

Ne relancer les anciens lots (`PENTEST-E2E-01`, `REPORTS-FINDINGS-01`, `PROVIDERS-01`, `WORKSPACE-UI-01`, `RUNTIME-EXT-01`, `SECURITY-OPS-01`) que si une nouvelle validation confirme un gap non traité et que l'ownership du correctif est redéfini.

## Avant de lancer beaucoup de sessions

Pré-requis recommandés:

1. Créer une branche de stabilisation ou au minimum noter le `git status --short` actuel.
2. Éviter que deux sessions lancent un formatage global.
3. Demander à chaque session d'écrire son résumé final dans son thread, pas dans les fichiers roadmap sauf `DOCS-01` ou `DOCS-02`.
4. Lancer une suite complète seulement après intégration des lots, pas dans chaque session si cela ralentit trop.
5. Pour les lots UI, utiliser browser-use après typecheck et tests ciblés.

## Hors périmètre immédiat

Ces sujets restent en backlog après la stabilisation MVP:

- Voice.
- IDE bridge.
- Remote sessions multi-surfaces.
- Marketplace plugins.
- Mobile/desktop/teleport.
- Analytics avancés non nécessaires au pilotage MVP.

### DEV-RUN-01 - Alignement runtime local

**Statut:** DONE le 2026-04-27.

**Ownership:**

- `/Users/aris/Documents/LEA/start.sh`
- `/Users/aris/Documents/LEA/.env.example`
- `/Users/aris/Documents/LEA/backend/.env.example`

**Objectif:** éviter que le backend local cherche PostgreSQL sur `localhost:5432` alors que le profil Docker dev expose le proxy sur `localhost:5433`.

**Livré:**

- `start.sh` adapte `DATABASE_URL` localement de `postgres:5432`, `lea-postgres:5432`, `localhost:5432` ou `127.0.0.1:5432` vers le proxy dev `5433`.
- `.env.example` documente la distinction entre le réseau Docker `postgres:5432` et les processus locaux `localhost:5433`.
- `backend/.env.example` utilise `localhost:5433` comme exemple local.

**Vérification:**

- `bash -n start.sh`
- `git diff --check -- start.sh .env.example backend/.env.example`

**Risque restant:** les développeurs qui lancent directement `cd backend && npm run dev` sans passer par `start.sh` doivent garder un `DATABASE_URL` local cohérent dans leur shell ou leur fichier env.

### RESUME-UX-01 - Reprise de scan depuis la sidebar

**Statut:** DONE le 2026-04-27.

**Ownership:**

- `/Users/aris/Documents/LEA/lea-app/components/layout/left-sidebar.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-list.ts`
- `/Users/aris/Documents/LEA/lea-app/components/layout/__tests__/left-sidebar.test.tsx`

**Objectif:** rendre la reprise d'un scan récent stable, partageable et explicite.

**Livré:**

- Les scans récents naviguent vers `/pentest?id=<pentestId>` au lieu de `/pentest`.
- La ligne active se base sur l'ID dans l'URL quand il existe, avant même l'hydratation du store.
- Les lignes récentes affichent statut et nombre de findings.
- Le hook de liste expose un état d'erreur et conserve les scans précédents en cas d'échec transitoire.

**Vérification:**

- `cd lea-app && npx vitest run components/layout/__tests__/left-sidebar.test.tsx`
- `cd lea-app && npm run typecheck`
- `cd lea-app && npm run lint -- --quiet`
