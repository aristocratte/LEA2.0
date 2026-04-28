# IMPLEMENTATION UI CLAUDE

## Objectif

Ce document sert de feuille de route UI pour rapprocher LEA de la logique d'interface visible dans `claude-code`, sans supposer qu'un composant déjà présent dans LEA est réellement branché ou terminé.

Règle de travail pour cette feuille:

- tout ce qui existe déjà dans LEA est considéré comme "à vérifier"
- un composant présent n'est pas forcément monté, connecté, ou fini
- la priorité est la continuité fonctionnelle de l'interface, pas le pixel-perfect

## Références UI globales à consulter

### Structure UI côté `claude-code`

- `/Users/aris/Documents/claude-code/src/components/App.tsx`
- `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInput.tsx`
- `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInputFooter.tsx`
- `/Users/aris/Documents/claude-code/src/components/StatusLine.tsx`
- `/Users/aris/Documents/claude-code/src/components/TaskListV2.tsx`
- `/Users/aris/Documents/claude-code/src/components/GlobalSearchDialog.tsx`
- `/Users/aris/Documents/claude-code/src/components/HistorySearchDialog.tsx`
- `/Users/aris/Documents/claude-code/src/components/ContextVisualization.tsx`
- `/Users/aris/Documents/claude-code/src/components/VirtualMessageList.tsx`
- `/Users/aris/Documents/claude-code/src/components/messages/*`
- `/Users/aris/Documents/claude-code/src/components/permissions/*`
- `/Users/aris/Documents/claude-code/src/components/agents/*`
- `/Users/aris/Documents/claude-code/src/components/tasks/*`
- `/Users/aris/Documents/claude-code/src/components/mcp/*`
- `/Users/aris/Documents/claude-code/src/components/memory/*`
- `/Users/aris/Documents/claude-code/src/components/hooks/*`
- `/Users/aris/Documents/claude-code/src/components/Settings/*`
- `/Users/aris/Documents/claude-code/src/components/diff/*`
- `/Users/aris/Documents/claude-code/src/components/RemoteEnvironmentDialog.tsx`
- `/Users/aris/Documents/claude-code/src/components/WorktreeExitDialog.tsx`
- `/Users/aris/Documents/claude-code/src/components/ResumeTask.tsx`

### Structure UI côté LEA

- `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmWorkspace.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmDashboard.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/active-screen.tsx`
- `/Users/aris/Documents/LEA/lea-app/components/chat/*`
- `/Users/aris/Documents/LEA/lea-app/components/layout/*`
- `/Users/aris/Documents/LEA/lea-app/components/pentest/*`
- `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx`
- `/Users/aris/Documents/LEA/lea-app/hooks/*`
- `/Users/aris/Documents/LEA/lea-app/store/*`

## Règle de validation LEA

Un lot UI est considéré comme "réellement présent" uniquement si:

1. le composant est monté dans une route ou une surface active
2. il est connecté à un store ou à une API réelle
3. il réagit à des données runtime, pas à du mock local
4. il a un état d'erreur, un état vide, un état chargé, un état actif

## État réel et lecture parallèle (2026-04-26)

Ce document reste la feuille UI longue. Pour lancer plusieurs sessions Codex, utiliser aussi `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`, qui assigne les surfaces UI par ownership de fichiers afin d'éviter les conflits.

Note Session 4: la passe DOCS-01 du 2026-04-26 garde cette feuille au niveau UI long terme. Les verrouillages de fichiers, le snapshot `git status --short` et les sessions de dispatch sont suivis dans `/Users/aris/Documents/LEA/ROADMAP-ACTIVE.md`.

Note post-stabilisation 2026-04-27: les surfaces Active Scan, providers, reports et runtime extensions ont été stabilisées par sessions parallèles puis relues. Le typecheck frontend, le lint frontend et la suite Vitest frontend (`420 passed`) sont verts; le backend de support est également vert avec `1086 passed`, `1 skipped`. `DOCS-03` synchronise cette feuille avec l'état réel après Session 10, Session 11 et `REPORT-PDF-EXPORT-01`.

Note RC finale 2026-04-28: la phase `RC-CUT-EXPERIMENTAL-DOCS-01` cache les surfaces expérimentales par défaut. Cette feuille UI reste une roadmap longue; elle ne doit pas être lue comme une liste de features visibles dans le MVP client.

| Bloc UI | Statut réel | Lecture opérationnelle |
|---|---|---|
| UI A - shell, workspace, input, status, search | PARTIAL / avancé | La shell moderne existe et l'ancienne UI a commencé à être retirée. Le workspace pentest doit rester la surface canonique unique. |
| UI B - permissions, agents, tasks, mémoire, review | PARTIAL / avancé | Les panneaux agents/tasks/teams/tools/skills existent. Il reste à valider les états actifs, erreurs, empty states et la cohérence du workflow. |
| UI C - MCP, hooks, skills, plugins, settings | PARTIAL | La console runtime extensions existe, mais elle doit être durcie comme surface produit et pas seulement vitrine technique. |
| UI D - resume, remote, IDE, export, voice | TODO / partiel | Reports/export et reprise existent partiellement. Remote, IDE et voice ne sont pas des priorités MVP immédiates. |

Définitions utilisées:

- DONE: monté, connecté à une donnée réelle, testé et cohérent dans le workflow.
- PARTIAL: composant ou route présent, mais expérience incomplète ou fragile.
- TODO: absent ou encore non connecté.
- BLOCKED: dépendance backend ou décision produit manquante.

## Ordre UI post-stabilisation (DOCS-02)

1. `FRONTEND-LINT-01` et `FRONTEND-LINT-02` sont terminés: le lint frontend global est vert.
2. `MVP-VERIFY-01` est terminé: le flux utilisateur complet a été validé via browser-use sur `127.0.0.1`.
3. `REPORT-PDF-EXPORT-01` est terminé: l'export PDF reports passe le smoke `/reports`, bouton PDF, `200 application/pdf` et fichier `%PDF`.
4. `DEV-RUN-01` et `RESUME-UX-01` sont terminés: le lancement local évite le piège PostgreSQL `5432/5433`, et les scans récents reprennent via URL stable `/pentest?id=...`.
5. Correctif smoke post-MVP: le bouton de lancement review ne tente plus `/start` avant que `preflight_state=PASSED` soit réellement persisté.
6. Remote, IDE et voice restent en backlog après le MVP stabilisé.

## Phase UI RC Stabilization - audit repo GitHub GPT-5.5 Pro (2026-04-27)

La priorité UI passe de "montrer toutes les capacités" à "inspirer confiance pendant un pentest réel". Le MVP doit cacher les surfaces expérimentales tant qu'elles ne sont pas alimentées par des données garanties.

Ordre UI retenu:

1. `RC-EVENTLOG-REPLAY-01`: adapter le live à `PentestEvent` durable; reload/reconnect ne doivent jamais faire disparaître un message.
2. `RC-ACTIVE-PROJECTION-01`: panneau Active Scan basé sur `PentestRunProjection` (status, phase, scope, tool activity, findings, erreurs), pas sur des agents/tasks vides.
3. `RC-UI-SPLIT-PERF-01`: découper `active-screen.tsx` après stabilisation du contrat: `LiveTimeline`, `RunStatusPanel`, `RunControls`, `ToolActivityPanel`, `StreamConnectionStatus`.
4. `RC-STOP-RUN-01`: Stop visible et fiable; Pause cachée tant qu'elle n'est pas prouvée.
5. `RC-REPORT-EVIDENCE-01`: reports et findings orientés preuve, avec statuts draft/validated/rejected visibles.
6. `RC-CUT-EXPERIMENTAL-DOCS-01`: suppression des anciennes surfaces visibles et feature flags pour l'expérimental.

Décisions UI MVP:

- Cacher par défaut runtime control swarm, traces swarm, Agents/Teams non fiables, Skills, Plugins, LSP, Hooks, raw MCP, Tool Invoke UI, ToolRegistry complet, Worktrees, Plan mode avancé, Remote, IDE, Voice et Marketplace.
- Active Scan doit afficher une timeline live + une projection de run fiable; aucun compteur `0` faux ou panel vide sans explication.
- Les follow-up prompts et l'input d'instructions supplémentaires restent indisponibles pendant un scan actif.
- Les reports doivent distinguer findings draft et findings validés, et conserver les preuves dans JSON/HTML/PDF.
- Les anciennes navigations/headers ne doivent plus réapparaître sur les surfaces MVP.
- Le frontend store est un cache UI; la vérité vient de `PentestEvent`, `PentestRunProjection`, `ToolExecution`/`KaliAuditLog` et `Finding`.

Risques UI restants:

- La shell et les panneaux sont présents, mais l'expérience doit encore être prouvée dans un parcours pentest continu, pas seulement par tests de composants.
- Les surfaces runtime extensions sont visibles; leur utilisabilité dépend d'une validation produit de MCP/LSP/skills/plugins.
- Les fichiers chauds UI (`lea-app/app/pentest/page.tsx`, `lea-app/app/settings/page.tsx`, `lea-app/app/reports/page.tsx`) ne doivent pas être retouchés hors lot dédié.

État après `RC-CUT-EXPERIMENTAL-DOCS-01`:

- La sidebar MVP évite les surfaces historiques ou non prouvées par défaut; Active Scan, Reports et Settings restent les chemins client principaux.
- `/settings` garde les providers au premier plan et masque la console runtime extensions sauf opt-in admin/dev.
- `/pentest` garde Stop, permissions, exports, timeline et projection de run visibles; Plan Mode, Worktree, Checkpoints et Analytics sont derrière flag.
- Le preflight privilégie le lancement standard et masque le lancement swarm multi-agents hors opt-in expérimental.
- Les flags frontend de référence sont `NEXT_PUBLIC_LEA_EXPERIMENTAL_UI`, `NEXT_PUBLIC_LEA_EXPERIMENTAL_RUNTIME_UI` et `NEXT_PUBLIC_LEA_ADVANCED_SCAN_CONTROLS`.
- La prochaine étape UI n'est plus une nouvelle phase, mais un smoke complet navigateur sur environnement propre et une décision de release candidate.

## Phase UI 0

### Shell général, layout, navigation, surfaces

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Shell principal de session | `/Users/aris/Documents/claude-code/src/components/App.tsx`, `/Users/aris/Documents/claude-code/src/components/FullscreenLayout.tsx` | `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/components/layout/app-shell.tsx`, `/Users/aris/Documents/LEA/lea-app/components/layout/shell.tsx` | confirmer quelle surface est vraiment la shell active | une shell unique structure l'expérience session |
| Sidebar navigation stable | `/Users/aris/Documents/claude-code/src/components/Settings/*`, commandes sidebar-like issues des menus | `/Users/aris/Documents/LEA/lea-app/components/layout/left-sidebar.tsx` | vérifier données réelles, historique, états actifs, navigation | sidebar connectée à des données réelles |
| Header session + badges de statut | `/Users/aris/Documents/claude-code/src/components/PromptInput/Notifications.tsx`, `/Users/aris/Documents/claude-code/src/components/StatusNotices.tsx`, `/Users/aris/Documents/claude-code/src/components/IdeStatusIndicator.tsx` | `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/components/network-status.tsx`, `/Users/aris/Documents/LEA/lea-app/components/chat/notification-center.tsx` | vérifier si le header est purement décoratif ou réellement piloté par le runtime | header connecté à la session, à la connectivité et aux alerts |
| Theme / apparence | `/Users/aris/Documents/claude-code/src/components/ThemePicker.tsx`, `/Users/aris/Documents/claude-code/src/commands/theme/theme.tsx` | `/Users/aris/Documents/LEA/lea-app/components/layout/theme-toggle.tsx`, `/Users/aris/Documents/LEA/lea-app/hooks/use-theme.ts` | vérifier persistance, application réelle et cohérence globale | thème réellement persistant |

## Phase UI 1

### Workspace principal de session

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Workspace conversation + agents + activité | `/Users/aris/Documents/claude-code/src/components/Messages.tsx`, `/Users/aris/Documents/claude-code/src/components/VirtualMessageList.tsx`, `/Users/aris/Documents/claude-code/src/components/CoordinatorAgentStatus.tsx`, `/Users/aris/Documents/claude-code/src/components/TaskListV2.tsx` | `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmWorkspace.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmDashboard.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/active-screen.tsx` | vérifier quelle surface doit devenir la surface principale | un seul workspace principal concentre thread, activité et inspection |
| Projection des événements runtime | `/Users/aris/Documents/claude-code/src/components/messages/*` | `/Users/aris/Documents/LEA/lea-app/components/pentest/swarm-workspace-projection.ts`, `/Users/aris/Documents/LEA/lea-app/store/swarm-store.ts` | vérifier que tous les types d'événements sont projetés et visibles | chaque événement important a une représentation UI claire |
| Vue agent-focused | `/Users/aris/Documents/claude-code/src/components/agents/AgentsList.tsx`, `/Users/aris/Documents/claude-code/src/components/agents/AgentDetail.tsx`, `/Users/aris/Documents/claude-code/src/components/agents/AgentsMenu.tsx` | `/Users/aris/Documents/LEA/lea-app/components/pentest/AgentCard.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/agent-control-panel.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/agent-widgets.tsx` | vérifier si LEA a une vraie vue détail agent et pas seulement un résumé | liste agents + vue détail + actions agent |
| Vue tâche persistante | `/Users/aris/Documents/claude-code/src/components/TaskListV2.tsx`, `/Users/aris/Documents/claude-code/src/components/tasks/BackgroundTasksDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/tasks/AsyncAgentDetailDialog.tsx` | `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmTaskPanel.tsx`, `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx` | vérifier si les tâches viennent d'un vrai runtime ou d'un mapping simplifié | panel tâches réel, filtrable, consultable |

## Phase UI 2

### Prompt input, footer, recherche, historique

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Prompt input riche | `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInput.tsx`, `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInputFooter.tsx`, `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInputFooterSuggestions.tsx`, `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInputHelpMenu.tsx` | `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx`, `/Users/aris/Documents/LEA/lea-app/components/chat/chat-input.tsx`, `/Users/aris/Documents/LEA/lea-app/components/chat/file-upload-zone.tsx` | vérifier si l'input envoie vraiment au backend et gère pièces jointes, slash, erreurs, états | input central branché au runtime réel |
| Search globale et search historique | `/Users/aris/Documents/claude-code/src/components/GlobalSearchDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/HistorySearchDialog.tsx` | `/Users/aris/Documents/LEA/lea-app/components/chat/search-modal.tsx`, `/Users/aris/Documents/LEA/lea-app/hooks/use-search-modal.ts`, `/Users/aris/Documents/LEA/lea-app/hooks/use-pentest-history.ts` | vérifier si la recherche parcourt uniquement le local state ou le vrai backlog session | recherche globale + historique session |
| Slash commands UI | `/Users/aris/Documents/claude-code/src/commands/*`, `/Users/aris/Documents/claude-code/src/components/PromptInput/PromptInputQueuedCommands.tsx` | `/Users/aris/Documents/LEA/lea-app/components/chat/slash-command-menu.tsx`, `/Users/aris/Documents/LEA/lea-app/hooks/use-slash-commands.ts` | vérifier si LEA ne fait encore que de l'insertion de texte | menu slash branché à des commandes réelles |
| Notifications prompt/footer | `/Users/aris/Documents/claude-code/src/components/PromptInput/Notifications.tsx`, `/Users/aris/Documents/claude-code/src/components/SessionBackgroundHint.tsx`, `/Users/aris/Documents/claude-code/src/components/IdleReturnDialog.tsx` | `/Users/aris/Documents/LEA/lea-app/components/chat/notification-center.tsx`, `/Users/aris/Documents/LEA/lea-app/hooks/use-toast.ts` | vérifier si LEA n'affiche que des toasts simples | notifications persistantes, contextualisées |
| Status line | `/Users/aris/Documents/claude-code/src/components/StatusLine.tsx`, `/Users/aris/Documents/claude-code/src/commands/statusline.tsx`, `/Users/aris/Documents/claude-code/src/components/TokenWarning.tsx`, `/Users/aris/Documents/claude-code/src/components/MemoryUsageIndicator.tsx` | nouvelle `StatusLine` LEA + rattachement à `/Users/aris/Documents/LEA/lea-app/app/pentest/page.tsx` | vérifier si les infos coût/tokens/permissions sont déjà visibles ailleurs | vraie status line en bas de l'input |

## Phase UI 3

### Permissions, approbations, modes, sécurité

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Dialog générique d'autorisation | `/Users/aris/Documents/claude-code/src/components/permissions/PermissionDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/permissions/PermissionPrompt.tsx` | nouvelle base LEA de dialogs d'approbation | vérifier si LEA n'a aujourd'hui que des approvals très spécialisées | un socle unique pour toutes les permissions |
| Permissions Bash, fichiers, web, sandbox | `/Users/aris/Documents/claude-code/src/components/permissions/BashPermissionRequest`, `/Users/aris/Documents/claude-code/src/components/permissions/FilePermissionDialog`, `/Users/aris/Documents/claude-code/src/components/permissions/WebFetchPermissionRequest`, `/Users/aris/Documents/claude-code/src/components/permissions/SandboxPermissionRequest` | nouvelles vues LEA pour Bash, edit, write, web, sandbox | vérifier quelles permissions LEA remontent déjà côté UI | chaque type de permission a son rendu dédié |
| Enter/Exit plan mode | `/Users/aris/Documents/claude-code/src/components/permissions/EnterPlanModePermissionRequest`, `/Users/aris/Documents/claude-code/src/components/permissions/ExitPlanModePermissionRequest` | nouvelle UI LEA plan mode | vérifier si le mode plan existe visuellement | entrée/sortie plan mode explicite |
| Trust / workspace access | `/Users/aris/Documents/claude-code/src/components/TrustDialog/TrustDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/WorktreeExitDialog.tsx` | nouveaux dialogs LEA trust/worktree | vérifier si LEA n'a pas seulement un mode implicite | trust dialog et sortie worktree explicites |
| Permissions browser | `/Users/aris/Documents/claude-code/src/commands/permissions/permissions.tsx`, `/Users/aris/Documents/claude-code/src/components/permissions/PermissionExplanation.tsx` | nouvelle page/commande permissions LEA | vérifier l'existence d'une vraie vue de règles | vue permissions consultable et modifiable |

## Phase UI 4

### Memory, contexte, diff, review, findings

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Memory browser | `/Users/aris/Documents/claude-code/src/components/memory/MemoryFileSelector.tsx`, `/Users/aris/Documents/claude-code/src/components/memory/MemoryUpdateNotification.tsx`, `/Users/aris/Documents/claude-code/src/commands/memory/memory.tsx` | nouvelles vues mémoire LEA + extension d'`active-screen` | vérifier si LEA montre seulement des snapshots | vraie navigation mémoire/fichiers/rappels |
| Context visualization | `/Users/aris/Documents/claude-code/src/components/ContextVisualization.tsx`, `/Users/aris/Documents/claude-code/src/commands/context/context.tsx` | `/Users/aris/Documents/LEA/lea-app/components/pentest/active-screen.tsx`, nouveau composant dédié si besoin | vérifier l'état actuel de la zone contexte | vue compacte + vue détaillée du contexte |
| Diff / review | `/Users/aris/Documents/claude-code/src/components/diff/DiffDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/StructuredDiff.tsx`, `/Users/aris/Documents/claude-code/src/commands/diff/diff.tsx`, `/Users/aris/Documents/claude-code/src/commands/review/*` | nouveaux dialogs diff LEA, enrichissement review pane | vérifier si LEA a déjà des vrais diffs ou seulement des résumés | diff lisible, review pilotable |
| Findings / review pane | `/Users/aris/Documents/claude-code/src/components/messages/PlanApprovalMessage.tsx`, `/Users/aris/Documents/claude-code/src/components/messages/TaskAssignmentMessage.tsx` | `/Users/aris/Documents/LEA/lea-app/components/pentest/SwarmFindingsTable.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/ReviewSummary.tsx`, `/Users/aris/Documents/LEA/lea-app/components/pentest/FindingEditModal.tsx` | vérifier la qualité de la navigation finding -> source -> décision | review pane utile et navigable |

## Phase UI 5

### MCP, skills, plugins, hooks, settings

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| MCP settings et tool browser | `/Users/aris/Documents/claude-code/src/components/mcp/MCPSettings.tsx`, `/Users/aris/Documents/claude-code/src/components/mcp/MCPToolListView.tsx`, `/Users/aris/Documents/claude-code/src/components/mcp/MCPToolDetailView.tsx`, `/Users/aris/Documents/claude-code/src/commands/mcp/mcp.tsx` | nouvelle section settings LEA MCP | vérifier si LEA n'a aujourd'hui qu'une config backend implicite | UI complète serveurs MCP + outils exposés |
| Hooks browser | `/Users/aris/Documents/claude-code/src/components/hooks/HooksConfigMenu.tsx`, `/Users/aris/Documents/claude-code/src/components/hooks/PromptDialog.tsx`, `/Users/aris/Documents/claude-code/src/commands/hooks/hooks.tsx` | nouvelle vue hooks LEA | vérifier absence actuelle | hooks visibles, filtrables, compréhensibles |
| Skills browser | `/Users/aris/Documents/claude-code/src/commands/skills/skills.tsx` | nouvelle vue skills LEA | vérifier absence actuelle | skills listées et inspectables |
| Plugins / marketplace UI | `/Users/aris/Documents/claude-code/src/commands/plugin/*`, `/Users/aris/Documents/claude-code/src/components/ClaudeCodeHint/PluginHintMenu.tsx`, `/Users/aris/Documents/claude-code/src/components/LspRecommendation/LspRecommendationMenu.tsx` | nouvelle UI plugin/marketplace LEA | vérifier absence actuelle | plugins browsables, installables, configurables |
| Settings avancés | `/Users/aris/Documents/claude-code/src/components/Settings/*`, `/Users/aris/Documents/claude-code/src/commands/config/config.tsx`, `/Users/aris/Documents/claude-code/src/components/ManagedSettingsSecurityDialog/*` | `/Users/aris/Documents/LEA/lea-app/app/settings/page.tsx` | vérifier quelles sections settings sont branchées ou non | settings centralisées, pas seulement providers |

## Phase UI 6

### Remote, onboarding, resume, extras

| Lot UI | Références `claude-code` | Cibles LEA probables | Vérification LEA à faire | Critère de fin |
|---|---|---|---|---|
| Resume / session picker | `/Users/aris/Documents/claude-code/src/commands/resume/resume.tsx`, `/Users/aris/Documents/claude-code/src/components/ResumeTask.tsx`, `/Users/aris/Documents/claude-code/src/components/SessionPreview.tsx` | nouvelle UI LEA session history/resume | vérifier si LEA a déjà un vrai picker de sessions | reprise de session ergonomique |
| Remote environment dialogs | `/Users/aris/Documents/claude-code/src/components/RemoteEnvironmentDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/RemoteCallout.tsx`, `/Users/aris/Documents/claude-code/src/commands/remote-env/remote-env.tsx`, `/Users/aris/Documents/claude-code/src/commands/remote-setup/remote-setup.tsx` | future UI LEA remote sessions | vérifier absence actuelle | surface remote cohérente |
| IDE onboarding / status | `/Users/aris/Documents/claude-code/src/components/IdeOnboardingDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/IdeStatusIndicator.tsx`, `/Users/aris/Documents/claude-code/src/components/ShowInIDEPrompt.tsx`, `/Users/aris/Documents/claude-code/src/commands/ide/ide.tsx` | future bridge LEA IDE | vérifier absence actuelle | onboarding IDE + statut IDE |
| Export / share / feedback | `/Users/aris/Documents/claude-code/src/components/ExportDialog.tsx`, `/Users/aris/Documents/claude-code/src/components/Feedback.tsx`, `/Users/aris/Documents/claude-code/src/components/FeedbackSurvey/*` | `/Users/aris/Documents/LEA/lea-app/components/chat/export-conversation.tsx` et extensions | vérifier si export LEA couvre assez de cas | export/share/feedback consolidés |
| Voice UI | `/Users/aris/Documents/claude-code/src/commands/voice/voice.ts`, `/Users/aris/Documents/claude-code/src/components/PromptInput/VoiceIndicator.tsx` | futur lot LEA optionnel | vérifier absence actuelle | voice indicator et contrôle vocal cohérents |

## Ordre d'implémentation UI recommandé

### Bloc UI A

1. shell principal
2. workspace principal
3. prompt input réel
4. status line
5. search globale et historique

### Bloc UI B

1. dialogs de permissions
2. vue agents
3. vue tâches
4. mémoire et contexte
5. diff et review

### Bloc UI C

1. MCP settings
2. hooks browser
3. skills browser
4. plugins / marketplace
5. settings avancés

### Bloc UI D

1. resume / session picker
2. remote dialogs
3. IDE onboarding
4. export/share/feedback
5. voice

## Vérifications spécifiques LEA à ne pas oublier

- `SwarmWorkspace` existe, mais vérifier s'il est la surface principale ou seulement une vue secondaire.
- `SwarmDashboard` existe, mais vérifier s'il est monté dans le flux produit.
- `ActiveScreen` existe, mais vérifier s'il n'est pas partiellement débranché.
- `search-modal`, `notification-center`, `slash-command-menu` existent, mais vérifier s'ils tapent dans le vrai state runtime.
- `chat-workspace` et `conversation-sidebar` existent, mais vérifier s'ils ne restent pas sur des données locales ou mockées.
- `settings/page.tsx` existe, mais vérifier si la page ne couvre que les providers.

## Définition de "UI proche de Claude Code" pour LEA

LEA sera suffisamment proche si:

- la session principale est centrée sur un workspace unique
- l'input, la status line, la recherche et les permissions sont intégrés dans cette surface
- agents, tâches, activité et review sont visibles sans changer de paradigme UI
- les settings avancés, MCP, hooks, skills et plugins ont des surfaces propres
- la reprise de session et les états long-lived deviennent naturelles pour l'utilisateur

## Checklist courte mise à jour

- [x] shell principale unifiée - DONE
- [-] workspace principal monté - PARTIAL: surface active présente, mais le workflow pentest end-to-end reste à durcir.
- [-] input réellement branché - PARTIAL: input et commandes présents; fiabilité E2E à vérifier sur scan réel.
- [-] search globale - PARTIAL
- [-] history search - PARTIAL
- [-] status line - PARTIAL
- [-] notifications enrichies - PARTIAL
- [-] dialogs permissions unifiés - PARTIAL
- [x] vue agents - DONE
- [x] vue tâches - DONE
- [-] vue mémoire - PARTIAL
- [-] vue contexte - PARTIAL
- [-] diff/review UI - PARTIAL
- [-] MCP settings UI - PARTIAL
- [-] hooks UI - PARTIAL
- [-] skills UI - PARTIAL
- [-] plugins UI - PARTIAL
- [-] settings avancés - PARTIAL
- [-] resume/session picker - PARTIAL
- [ ] remote dialogs - TODO
- [ ] IDE onboarding - TODO
- [-] export/share/feedback - PARTIAL
- [ ] voice indicator - TODO
