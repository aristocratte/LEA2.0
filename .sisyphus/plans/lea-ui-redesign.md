# LEA Platform UI Redesign Plan

## Objectif
Refaire complètement l'interface de l'application de pentest automatisé par IA avec un style moderne type ChatGPT/Claude :
- Layout classique chatbot : conversation list à droite, chat principal au centre
- Pas de side panel gauche
- Support de tous les types d'interactions AI (todo, spawn agent, execute command, read, search, etc.)
- Design simple, épuré, moderne, smooth
- Couleurs unies, style Apple-like
- Pas d'emojis, icônes uniquement (Lucide React)

## Architecture Actuelle
- Next.js 16 + React 19
- Tailwind CSS 4
- Framer Motion pour les animations
- Zustand pour le state management
- shadcn/ui pour les composants de base
- Lucide React pour les icônes

## Tâches

### [T1] Design System & CSS Variables
**Fichiers concernés:**
- `lea-app/app/globals.css` (modification)
- `lea-app/tailwind.config.ts` (modification)

**Livrables:**
- Palette de couleurs Apple-like (gris, blancs, noirs, accents cyan/indigo/amber)
- Variables CSS pour tous les tokens de design
- Typography system (font sizes, line heights, weights)
- Spacing scale
- Shadow et border radius tokens
- Animation timing functions

**Design Specs:**
- Background: #FAFAFA (light) / #1A1A1A (dark)
- Surface: #FFFFFF (light) / #2A2A2A (dark)
- Text Primary: #1A1A1A (light) / #FAFAFA (dark)
- Text Secondary: #6B7280
- Accent Primary: #007AFF (Apple blue)
- Accent Success: #34C759
- Accent Warning: #FF9500
- Accent Error: #FF3B30
- Border: rgba(0,0,0,0.1) (light) / rgba(255,255,255,0.1) (dark)
- Border Radius: 8px (petit), 12px (moyen), 16px (grand), 24px (input/chat)
- Shadows subtiles et douces

---

### [T2] Nouveau Layout Principal
**Fichiers concernés:**
- `lea-app/components/layout/new-shell.tsx` (création)
- `lea-app/components/layout/chat-layout.tsx` (création)
- `lea-app/components/layout/conversation-sidebar.tsx` (création)
- `lea-app/app/pentest/page.tsx` (modification)

**Livrables:**
- Layout 3 zones : Header (top), Chat Area (center), Conversation List (right sidebar)
- Header minimaliste avec titre et actions principales uniquement
- Zone de chat principale (centre) avec largeur max 800px
- Sidebar de conversations à droite (280px width, collapsible)
- Responsive: sidebar se cache sur mobile/tablet avec bouton toggle

**Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  Header (minimal)                                       │
├────────────────────────────────────────┬────────────────┤
│                                        │                │
│         Chat Area (center)             │  Conversation  │
│         max-width: 800px               │   Sidebar      │
│                                        │   (right)      │
│                                        │   280px        │
│                                        │                │
├────────────────────────────────────────┴────────────────┤
│              Input Area (fixed bottom)                  │
└─────────────────────────────────────────────────────────┘
```

---

### [T3] Composants de Messages (Redesign Complet)
**Fichiers concernés:**
- `lea-app/components/chat/message-list.tsx` (création)
- `lea-app/components/chat/message-item.tsx` (création)
- `lea-app/components/chat/message-assistant.tsx` (création)
- `lea-app/components/chat/message-user.tsx` (création)
- `lea-app/components/chat/message-todo.tsx` (création)
- `lea-app/components/chat/message-tool.tsx` (création)
- `lea-app/components/chat/message-agent-spawn.tsx` (création)
- `lea-app/components/chat/message-approval.tsx` (création)
- `lea-app/components/chat/message-thinking.tsx` (création)
- `lea-app/components/chat/message-read.tsx` (création)
- `lea-app/components/chat/message-search.tsx` (création)
- `lea-app/components/chat/message-execute.tsx` (création)

**Types de messages à supporter:**
1. **assistant_message** : Message texte de l'IA (style ChatGPT)
2. **user_message** : Message de l'utilisateur (bubbles à droite)
3. **thinking_summary** : Note de réflexion (style Claude, collapsible)
4. **todo** : Tâche/todo item avec status (pending/running/completed)
5. **tool_execution** : Exécution d'outil/commande (avec output collapsible)
6. **read** : Opération de lecture fichier
7. **search** : Résultat de recherche
8. **agent_spawn** : Création d'agent (avec badges agents)
9. **approval_request** : Demande d'approbation (style distinct)
10. **finding** : Découverte de vulnérabilité

**Design Guidelines:**
- Messages assistant : fond clair/subtil, aligné à gauche
- Messages user : fond accent color, aligné à droite, texte blanc
- Tool execution : carte avec header (icon + nom outil) + output monospace
- Todo : checkbox + texte + status badge
- Agent spawn : avatar + nom + rôle + liste agents créés
- Approval : carte warning avec boutons approve/deny

---

### [T4] Zone d'Input (Redesign)
**Fichiers concernés:**
- `lea-app/components/chat/chat-input.tsx` (création)
- `lea-app/components/chat/input-actions.tsx` (création)

**Livrables:**
- Input type ChatGPT/Claude (largeur pleine, bordures arrondies)
- Textarea auto-expand (max 5 lignes)
- Bouton send (arrow up) dans l'input
- Actions rapides sous l'input (boutons contextuels)
- Support drag & drop fichiers
- Placeholder contextuel
- Animations smooth (focus, hover)

**Specs:**
- Border radius: 24px
- Padding: 16px 20px
- Background: surface color
- Border: 1px solid subtle
- Shadow: 0 2px 8px rgba(0,0,0,0.04)
- Focus: border accent color + shadow accent

---

### [T5] Sidebar Conversations (Redesign)
**Fichiers concernés:**
- `lea-app/components/chat/conversation-list.tsx` (création)
- `lea-app/components/chat/conversation-item.tsx` (création)
- `lea-app/components/chat/conversation-header.tsx` (création)

**Livrables:**
- Liste des conversations/pentests
- Item avec : titre, date, status badge, nombre de findings
- Bouton "New Chat" en haut
- Group by date (Today, Yesterday, Previous)
- Hover states smooth
- Selected state distinct
- Bouton toggle pour mobile

**Specs:**
- Width: 280px
- Background: surface color
- Item padding: 12px 16px
- Border radius items: 8px
- Gap entre items: 4px

---

### [T6] Header & Navigation (Redesign)
**Fichiers concernés:**
- `lea-app/components/layout/chat-header.tsx` (création)

**Livrables:**
- Header minimaliste (hauteur réduite: 56px)
- Logo/Nom app à gauche
- Titre conversation au centre
- Actions à droite (settings, providers, etc.)
- Connexion status indicator
- Responsive avec menu hamburger

---

### [T7] Intégration & Store Updates
**Fichiers concernés:**
- `lea-app/components/chat/chat-workspace.tsx` (création - remplace SwarmWorkspace)
- `lea-app/store/chat-store.ts` (création - adapte use-swarm-store)
- `lea-app/app/pentest/page.tsx` (modification finale)

**Livrables:**
- Composant ChatWorkspace qui assemble tout
- Store mis à jour avec nouvelles structures
- Gestion du scroll auto
- Gestion des messages streaming
- Gestion de la sélection conversation

---

### [T8] Animations & Polish
**Fichiers concernés:**
- `lea-app/components/chat/animations.ts` (création)
- Tous les composants pour ajouter framer-motion

**Livrables:**
- Animations d'entrée messages (fade + slide up)
- Animation typing indicator
- Animation transitions entre conversations
- Animation envoi message (scale + fade)
- Smooth scroll behavior
- Loading states animés

---

## Order de Développement

### Phase 1: Fondation (parallèle)
- [T1] Design System
- [T2] Layout Principal

### Phase 2: Composants Core (parallèle)
- [T3] Message Components
- [T4] Input Area
- [T5] Conversation Sidebar
- [T6] Header

### Phase 3: Intégration (séquentiel)
- [T7] ChatWorkspace + Store (dépend de T1-T6)

### Phase 4: Polish (parallèle)
- [T8] Animations
- Tests et ajustements

## Fichiers Existants à Conserver/Référencer
- `lea-app/hooks/use-swarm-store.ts` - Logique de projection à adapter
- `lea-app/store/swarm-store.ts` - Connexion SSE à conserver
- `lea-app/types/index.ts` - Types à réutiliser
- `lea-app/lib/api.ts` - API calls à conserver

## Fichiers à Créer (nouvelle structure)
```
lea-app/components/chat/
  ├── chat-workspace.tsx      # Composant principal
  ├── message-list.tsx        # Liste des messages
  ├── message-item.tsx        # Wrapper message
  ├── message-assistant.tsx   # Message IA
  ├── message-user.tsx        # Message user
  ├── message-todo.tsx        # Todo item
  ├── message-tool.tsx        # Tool execution
  ├── message-read.tsx        # Read file
  ├── message-search.tsx      # Search results
  ├── message-agent-spawn.tsx # Agent spawn
  ├── message-approval.tsx    # Approval request
  ├── message-thinking.tsx    # Thinking note
  ├── message-finding.tsx     # Vulnerability finding
  ├── chat-input.tsx          # Zone input
  ├── input-actions.tsx       # Actions rapides
  ├── conversation-list.tsx   # Sidebar conversations
  ├── conversation-item.tsx   # Item conversation
  ├── conversation-header.tsx # Header sidebar
  └── animations.ts           # Config animations

lea-app/components/layout/
  ├── new-shell.tsx           # Nouveau layout shell
  ├── chat-layout.tsx         # Layout spécifique chat
  └── chat-header.tsx         # Header minimaliste

lea-app/store/
  └── chat-store.ts           # Store adapté (optionnel, peut étendre existant)
```

## Notes Importantes

1. **Pas d'emojis** : Utiliser uniquement Lucide React icons
2. **Couleurs unies** : Pas de dégradés complexes, couleurs flat Apple-like
3. **Typographie** : Geist (déjà configuré), tailles cohérentes
4. **Espacement** : 4px base grid, espacements cohérents
5. **Animations** : Framer Motion, durées 200-300ms, easing smooth
6. **Accessibilité** : Contrastes suffisants, focus states visibles
7. **Responsive** : Mobile-first, sidebar se cache sur petits écrans

## Vérification Finale

Avant de terminer, vérifier:
- [ ] Tous les types de messages sont rendus correctement
- [ ] Animations fluides sur tous les composants
- [ ] Responsive fonctionne sur mobile/tablet/desktop
- [ ] Pas de régression sur la fonctionnalité (SSE, pentest execution)
- [ ] Code TypeScript propre sans erreurs
- [ ] Pas de console errors
