# ADR-0003 — AuthN/AuthZ pour Swarm & outils sensibles

- **Statut**: Accepté (MVP + hardening progressif)
- **Date**: 2026-02-27
- **Décideurs**: LEA core team
- **Contexte lié**: `doc/lea2/non-functional.md`, `backend/src/services/mcp/*`

## Contexte
Le backend actuel est orienté environnement contrôlé (LAN/dev) avec CORS et sans couche IAM complète.
Le Swarm introduit des actions sensibles:
- exécution d’outils MCP potentiellement impactants,
- push automatique dans SysReptor,
- contrôle de run (pause/force-merge).

Il faut sécuriser le MVP sans bloquer la vélocité, puis permettre une montée en sécurité.

## Options évaluées
1. IAM complet (OIDC + RBAC complet) dès maintenant
2. Mode MVP “single-operator” + garde-fous forts sur actions sensibles
3. Aucune AuthN/AuthZ spécifique (rejeté)

## Décision
Nous retenons **Option 2**.

## Politique retenue

### 1) AuthN API (MVP)
- Le backend supporte un token d’API (`LEA_API_TOKEN`) côté serveur.
- Les routes d’écriture critiques (`/swarm/start`, `/swarm/pause`, `/swarm/force-merge`, push report) requièrent `Authorization: Bearer <token>` hors mode dev.
- Mode dev local explicitement autorisé via variable dédiée (`NODE_ENV=development`), mais non recommandé en staging/prod.

### 2) AuthZ fonctionnelle
Rôles logiques minimaux:
- `operator`: lancer/piloter swarm, approuver tool sensible, pousser SysReptor.
- `reviewer`: lecture seule (history, findings, PDF preview).
- `system_agent`: rôle interne orchestration, permissions limitées.

### 3) Confirmation explicite des tools sensibles (obligatoire)
- Toute action MCP classée “sensible” passe par un mécanisme d’approbation explicite.
- Le Swarm émet un événement `tool_approval_required` avec contexte (tool, cible, risque).
- Sans approbation valide, exécution bloquée (`status=BLOCKED`) et audit log.

### 4) Auditabilité
Chaque action sensible logue au minimum:
- `timestamp`, `pentestId`, `swarmRunId`, `agentId`
- `actor` (operator/system)
- `tool`, `argumentsHash`, `decision` (`APPROVED|DENIED|AUTO_BLOCKED`)
- `result` + `duration`

### 5) Gestion des secrets
- Secrets (SysReptor, clés providers) exclusivement backend (.env/secret store).
- Aucune exposition de token/API key au frontend.

## Conséquences
### Positives
- Réduction immédiate du risque opérationnel sans implémenter un IAM lourd.
- Traçabilité exploitable pour audit et conformité.
- Compatible avec une future migration OIDC/RBAC complète.

### Négatives / risques
- Gestion de rôles simplifiée au MVP.
- UX légèrement plus lourde à cause des confirmations manuelles.

### Mitigations
- UI claire des demandes d’approbation (one-click approve/deny + contexte).
- Timeout configurable sur les demandes d’approbation.

## Alternatives rejetées
- **IAM complet immédiat**: trop coûteux pour le scope MVP.
- **Aucune protection supplémentaire**: incompatible avec exigences sécurité Swarm.

## Plan d’implémentation découlant de cette ADR
1. Ajouter middleware auth sur routes swarm write.
2. Introduire le flux `tool_approval_required` + endpoint d’approbation.
3. Logger systématiquement approbations/refus dans `KaliAuditLog`.
4. Documenter matrice de permissions dans README/SWARM_IMPLEMENTATION.
