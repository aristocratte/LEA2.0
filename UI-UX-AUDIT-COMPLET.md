# 🔍 Audit UI/UX Complet - LEA Pentest Chatbot

**Date**: 15 Mars 2026  
**Date de mise à jour**: 16 Mars 2026  
**Projet**: LEA Platform - Interface Pentest Automatisé  
**Focus**: UI/UX uniquement - Transformation en expérience chatbot professionnelle

---

## 🎯 Status d'Implémentation

### ✅ Tâches Complétées (16 Mars 2026)

| Tâche | Description | Fichiers Modifiés |
|-------|-------------|-------------------|
| **3.1** | Historique des conversations | `components/layout/left-sidebar.tsx` |
| **3.2** | Composant dropdown-menu (fondation) | `components/ui/dropdown-menu.tsx` (nouveau) |
| **3.3** | Streaming indicators | ⚠️ DÉJÀ EXISTANT - Rien à faire |
| **3.13** | Empty state avec suggestions | `components/chat/empty-state.tsx` (nouveau) |
| **3.13** | Tooltips dans config-screen | `components/pentest/config-screen.tsx` |

### 📁 Fichiers Créés
- `lea-app/components/ui/dropdown-menu.tsx` - Composant Radix UI pour menus déroulants
- `lea-app/components/chat/empty-state.tsx` - Empty state avec suggestions rapides

### 📁 Fichiers Modifiés
- `lea-app/components/layout/left-sidebar.tsx` - Intégration historique pentests dynamique
- `lea-app/components/pentest/config-screen.tsx` - TooltipProvider et composant FieldTooltip

### ✅ Build Status
```
✓ TypeScript compilation: PASSED
✓ Next.js build: SUCCESS
✓ Static pages generated: 8/8
```

---

## 📋 Table des matières

1. [Vue d'ensemble de l'architecture actuelle](#1-vue-densemble-de-larchitecture-actuelle)
2. [Ce qui fonctionne bien ✅](#2-ce-qui-fonctionne-bien-)
3. [Fonctionnalités CRITIQUES manquantes ❌](#3-fonctionnalités-critiques-manquantes-)
4. [Recommandations d'implémentation](#4-recommandations-dimplémentation)
5. [Comparatif avec les leaders du marché](#5-comparatif-avec-les-leaders-du-marché)
6. [Wireframes et spécifications](#6-wireframes-et-spécifications)

---

## 1. Vue d'ensemble de l'architecture actuelle

### 1.1 Structure technique actuelle

```
/Users/aris/Documents/LEA/lea-app/
├── app/
│   ├── pentest/page.tsx          # Interface principale (631 lignes)
│   ├── globals.css               # Styles globaux
│   └── layout.tsx                # Layout racine
├── components/
│   ├── chat/
│   │   ├── chat-input.tsx        # Input avec textarea auto-resize
│   │   ├── message-list.tsx      # Liste des messages
│   │   ├── message-item.tsx      # Types de messages (assistant, thinking, agent)
│   │   ├── empty-state.tsx       # ✅ NOUVEAU - Empty state avec suggestions
│   │   └── agent-panel.tsx       # Panel droit des tâches
│   ├── layout/
│   │   ├── left-sidebar.tsx      # Navigation (220px) - ✅ Historique intégré
│   │   └── shell.tsx             # Conteneur global
│   ├── pentest/
│   │   ├── config-screen.tsx     # Wizard de configuration (3 étapes) - ✅ Tooltips ajoutés
│   │   ├── active-screen.tsx     # Écran pentest actif
│   │   └── AgentCard.tsx         # Carte agent dans le chat
│   └── ui/
│       ├── dropdown-menu.tsx     # ✅ NOUVEAU - Composant Radix UI
│       └── tooltip.tsx           # Tooltip component existant
```

### 1.2 Stack technique

- **Framework**: Next.js 16 + React 19
- **Styling**: Tailwind CSS 4 + Framer Motion
- **State**: Zustand (pentest-store.ts)
- **Icons**: Lucide React
- **UI Components**: shadcn/ui personnalisé

### 1.3 Design System actuel

**Palette de couleurs**:
- Background: `#FAFAFA` (light gray)
- Primary: `#F5A623` (amber/orange)
- Text primary: `#111827` (gray-900)
- Text secondary: `#6B7280` (gray-500)
- Borders: `#E5E5E5` (gray-200)

**Typography**:
- Font: System default (sans-serif)
- Messages: `text-sm leading-relaxed`
- Input: `text-[15px]`

**Layout**:
- Sidebar gauche: 220px
- Zone chat: flex-1 (responsive)
- Sidebar droite: 260px (Agent Tasks)

---

## 2. Ce qui fonctionne bien ✅

### 2.1 Layout global à 3 colonnes

**Points positifs**:
- Structure claire et familière (similaire à Grok, Claude)
- Navigation intuitive entre les sections
- Séparation logique des responsabilités
- Responsive sur différentes tailles d'écran

**Implémentation actuelle** (dans `pentest/page.tsx`):
```tsx
<div className="flex h-screen bg-[#FAFAFA]">
  <LeftSidebar />
  <main className="flex-1 flex flex-col min-w-0 bg-white">
    {/* Phase Indicator */}
    {/* Active Agent Banner */}
    {/* Messages */}
    {/* Input */}
  </main>
  <aside className="w-[260px] h-screen bg-[#FAFAFA] border-l border-gray-100">
    {/* Agent Tasks */}
  </aside>
</div>
```

### 2.2 Système de messages

**Architecture solide**:
- Types de messages bien définis: `user`, `assistant`, `agent-card`
- Animation d'apparition fluide avec Framer Motion
- Différenciation visuelle claire (bubble user à droite, assistant à gauche)

**Code actuel**:
```typescript
type MessageType = 'user' | 'assistant' | 'agent-card';

interface Message {
  id: string;
  type: MessageType;
  content?: string;
  agent?: Agent;
}
```

### 2.3 Input design

**Bonne UX**:
- Textarea auto-resize (`min-h-[44px] max-h-[200px]`)
- Support Shift+Enter pour nouvelle ligne
- Bouton Send désactivé quand vide
- Mode Stealth toggle intégré
- Focus ring avec couleur brand (#F5A623)

### 2.4 Cartes agents dans le chat

**Innovation forte**:
- Agents qui apparaissent comme des messages spéciaux
- Expansion/collapse des détails
- Indicateurs de statut visuels (spawning, active, completed)
- Affichage des subtasks en temps réel

**Implémentation**:
```tsx
<AgentCardInChat 
  agent={agent}
  isExpanded={expandedAgents.has(agent.id)}
  onToggle={() => toggleAgentExpand(agent.id)}
/>
```

### 2.5 Animations

**Qualité motion**:
- `AnimatePresence` pour les entrées/sorties
- Stagger sur les subtasks
- Pulse sur les indicateurs actifs
- Transitions smooth sur les interactions

---

## 3. Fonctionnalités CRITIQUES manquantes ❌

### 🎯 3.1 Historique des Conversations ✅

#### Problème identifié
L'utilisateur n'a aucun moyen de retrouver ou reprendre une session de pentest précédente. Chaque nouvelle interaction est complètement isolée. C'est un blocage majeur pour une utilisation professionnelle.

#### Impact utilisateur
- **Perte de contexte**: Impossible de reprendre une analyse en cours
- **Pas d'audit trail**: Pas d'historique des actions passées
- **Frustration**: Doit tout recommencer à chaque session
- **Non scalable**: Impossible de gérer plusieurs cibles simultanément

#### Benchmark concurrentiel

**ChatGPT**:
```
Sidebar gauche:
├── New chat (bouton principal)
├── Today
│   ├── Pentest: example.com
│   ├── Analyse de vulnérabilités API
│   └── Scan infrastructure interne
├── Yesterday
│   ├── Configuration test OWASP
│   └── Rapport final - Client X
├── Previous 7 Days
│   └── [liste des conversations]
└── Search conversations...
```

**Claude**:
- Chaque conversation est un projet indépendant
- Renommage automatique basé sur le premier message
- Favoris pour les conversations importantes
- Partage de conversations via liens

**Grok**:
- Mode "Deep Search" conserve l'historique
- Suggestions basées sur les conversations passées
- Resume conversation après reconnexion

#### Spécification fonctionnelle

**Modèle de données nécessaire**:
```typescript
interface Conversation {
  id: string;
  title: string;
  target: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  status: 'active' | 'archived' | 'completed';
  tags: string[];
  lastMessagePreview: string;
}
```

**UI Recommandée**:
```tsx
// Dans LeftSidebar, remplacer la navigation actuelle par:

<aside className="w-[260px] h-screen bg-white border-r border-gray-200 flex flex-col">
  {/* Header */}
  <div className="p-4 border-b border-gray-200">
    <button className="w-full flex items-center justify-center gap-2 
      bg-[#F5A623] text-white rounded-xl py-3 font-medium
      hover:bg-[#E09500] transition-colors">
      <Plus className="w-5 h-5" />
      New Pentest
    </button>
  </div>
  
  {/* Search */}
  <div className="p-3">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input 
        type="text"
        placeholder="Search conversations..."
        className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm"
      />
    </div>
  </div>
  
  {/* Conversation List */}
  <div className="flex-1 overflow-y-auto px-3">
    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 px-2">
      Today
    </div>
    {conversations.map(conv => (
      <ConversationItem 
        key={conv.id}
        title={conv.title}
        target={conv.target}
        timestamp={conv.updatedAt}
        isActive={currentId === conv.id}
        onClick={() => loadConversation(conv.id)}
      />
    ))}
  </div>
</aside>
```

**Composant ConversationItem**:
```tsx
function ConversationItem({ title, target, timestamp, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl mb-1 transition-all group",
        isActive 
          ? "bg-gray-100 border border-gray-200" 
          : "hover:bg-gray-50 border border-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F5A623] to-[#E09500] 
          flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{title}</p>
          <p className="text-xs text-gray-500 truncate">{target}</p>
          <p className="text-xs text-gray-400 mt-1">{formatTime(timestamp)}</p>
        </div>
        {isActive && (
          <div className="w-2 h-2 rounded-full bg-[#F5A623]" />
        )}
           </div>
     </button>
   );
 }
 ```

---

#### ✅ Implémentation Réalisée (16 Mars 2026)

**Fichier modifié**: `lea-app/components/layout/left-sidebar.tsx`

**Fonctionnalités implémentées**:
- ✅ Intégration de `usePentestList` pour charger les pentests en temps réel
- ✅ Affichage dynamique avec status dots colorés (active/paused/completed/config)
- ✅ Formatage des dates relatives (2m, 3h, 1d, 7d)
- ✅ Highlight du pentest actif avec style distinct
- ✅ Skeleton loader pendant le chargement
- ✅ Message "No pentests yet" quand la liste est vide
- ✅ Navigation au clic avec `loadFromApi` + `router.push`
- ✅ Bouton "New scan" avec reset du store et navigation

**Code clé ajouté**:
```typescript
// Hooks
const { pentests, isLoading: pentestsLoading } = usePentestList();
const activePentestId = usePentestStore((s) => s.pentestId);

// Navigation
onClick={() => {
  usePentestStore.getState().loadFromApi(pentest);
  router.push('/pentest');
}}
```

---

**🤖 Déploiement agents requis : 4 sous-agents** (Original - Non utilisé car implémentation directe)

---

### 📝 3.2 Actions sur les Messages

#### Problème identifié
Les messages sont affichés en lecture seule. L'utilisateur ne peut pas interagir avec eux (copier, modifier, regénérer). C'est une limitation majeure par rapport aux chatbots modernes.

#### Impact utilisateur
- **Frustration**: Doit sélectionner manuellement le texte pour copier
- **Pas de contrôle**: Impossible de corriger une réponse incorrecte
- **Productivité réduite**: Pas de raccourcis pour actions fréquentes
- **Confiance**: Manque de transparence (pas de feedback sur les actions possibles)

#### Benchmark concurrentiel

**ChatGPT**:
- Hover sur message → apparition toolbar
- Actions: Copy, Regenerate, Delete, Edit
- Feedback visuel immédiat
- Support clavier (⌘+C sur message sélectionné)

**Claude**:
- Menu contextuel (3 dots) permanent
- Copy avec feedback toast
- Retry en cas d'erreur
- Rate limits affichés clairement

**Perplexity**:
- Sources cliquables dans les réponses
- Copy citation
- Share thread
- Export (PDF, Markdown)

#### Spécification fonctionnelle

**Actions requises par type de message**:

**Message Assistant**:
```
┌─────────────────────────────────────┐
│ [Avatar] Message content...         │
│                                     │
│ [Toolbar - visible au hover]        │
│ [📋 Copy] [🔄 Regenerate] [👍👎]    │
└─────────────────────────────────────┘
```

**Message Utilisateur**:
```
┌─────────────────────────────────────┐
│ Message content...              [✏️]│
│                                     │
│ [Edit - modifie le message et      │
│  regénère la suite de la conv]     │
└─────────────────────────────────────┘
```

**Message Agent Card**:
```
┌─────────────────────────────────────┐
│ [Agent Card Content]                │
│                                     │
│ [📋 Copy output] [🛑 Stop agent]   │
│ [📊 View full logs] [🔍 Details]   │
└─────────────────────────────────────┘
```

**Implémentation recommandée**:

```tsx
// Composant MessageActions
interface MessageActionsProps {
  messageId: string;
  content: string;
  type: 'user' | 'assistant' | 'agent';
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function MessageActions({ 
  messageId, content, type, 
  onCopy, onRegenerate, onEdit, onDelete 
}: MessageActionsProps) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };
  
  return (
    <div 
      className="absolute right-2 -top-8 opacity-0 group-hover:opacity-100 
        transition-opacity flex items-center gap-1 bg-white border border-gray-200 
        rounded-lg shadow-sm px-2 py-1"
      onMouseEnter={() => setShowActions(true)}
    >
      <button 
        onClick={handleCopy}
        className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 
          transition-colors"
        title={copied ? "Copied!" : "Copy"}
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </button>
      
      {type === 'assistant' && onRegenerate && (
        <button 
          onClick={onRegenerate}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500"
          title="Regenerate"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
      
      {type === 'user' && onEdit && (
        <button 
          onClick={onEdit}
          className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500"
          title="Edit"
        >
          <Edit className="w-4 h-4" />
        </button>
      )}
      
      <div className="w-px h-4 bg-gray-200 mx-1" />
      
      <button 
        onClick={onDelete}
        className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// Usage dans MessageItem
function MessageItem({ item }: MessageItemProps) {
  return (
    <div className="relative group">
      <MessageActions 
        messageId={item.id}
        content={item.content}
        type={item.type}
        onCopy={() => toast.success('Copied to clipboard')}
        onRegenerate={() => regenerateMessage(item.id)}
        onEdit={() => editMessage(item.id)}
      />
      {/* Message content */}
    </div>
  );
}
```

---

#### ⚠️ Status Partiel (16 Mars 2026)

**Fondation créée** - Composant UI prêt :
- ✅ `lea-app/components/ui/dropdown-menu.tsx` créé
  - Exports: DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup
  - Basé sur Radix UI (radix-ui package)
  - Suit les conventions shadcn/ui
  - Prêt à être utilisé pour les menus d'actions de messages

**Reste à implémenter**:
- ❌ Composant MessageActions avec toolbar
- ❌ Intégration dans les composants de messages
- ❌ Handlers copy/regenerate/edit/delete
- ❌ Tests

---

**🤖 Déploiement agents requis : 3 sous-agents** (Original)

---

### 💬 3.3 Indicateurs de Streaming et Typing ✅ (DÉJÀ IMPLÉMENTÉ)

#### Problème identifié
Les messages apparaissent instantanément sans aucun feedback de traitement. L'utilisateur ne peut pas distinguer entre "l'IA réfléchit" et "c'est bloqué/bloqué". Pour un pentest qui peut durer plusieurs minutes, c'est critique.

#### Impact utilisateur
- **Anxiété**: Ne sait pas si son message a été reçu
- **Impatience**: Pas de visibilité sur la progression
- **Abandon**: Risque de recharger la page (perte de contexte)
- **Mauvaise UX**: Semble "cassé" pendant les longues opérations

#### Benchmark concurrentiel

**ChatGPT**:
- Typing indicator avec 3 dots animés
- Streaming mot par mot (token streaming)
- "ChatGPT is thinking..." sur les requêtes complexes
- Cursor clignotant à la fin du texte en cours

**Claude**:
- "Claude is thinking..." avec animation subtile
- Progression visuelle pendant les appels API
- Temps estimé pour les longues opérations
- Indicateurs de phase (analyzing → reasoning → responding)

**Grok**:
- Streaming fluide avec vitesse adaptative
- Indicateurs de recherche en temps réel
- Sources qui apparaissent progressivement
- Mode "Deep Search" avec barre de progression

#### Spécification fonctionnelle

**Types d'indicateurs nécessaires**:

**1. Typing Indicator (réflexion courte)**:
```
[Avatar] ● ● ●
```

**2. Thinking Indicator (réflexion profonde)**:
```
┌─────────────────────────────────────┐
│ [Avatar] Nia is thinking...         │
│                                     │
│ [░░░░░░░░░░░░░░░░░░] 0%            │
│ Analyzing attack surface...         │
└─────────────────────────────────────┘
```

**3. Agent Activity Indicator**:
```
┌─────────────────────────────────────┐
│ 3 agents working                    │
│                                     │
│ [████████░░] Port Scanner (80%)    │
│ [█████░░░░░] Web Crawler (50%)     │
│ [░░░░░░░░░░] Vuln Scanner (0%)     │
│                                     │
│ [Stop All] [View Details]          │
└─────────────────────────────────────┘
```

**4. Streaming Text**:
```tsx
// Message qui apparaît mot par mot
function StreamingMessage({ content, isStreaming }: { content: string, isStreaming: boolean }) {
  const [displayedContent, setDisplayedContent] = useState('');
  
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      return;
    }
    
    const words = content.split(' ');
    let index = 0;
    
    const interval = setInterval(() => {
      if (index < words.length) {
        setDisplayedContent(prev => 
          prev + (prev ? ' ' : '') + words[index]
        );
        index++;
      } else {
        clearInterval(interval);
      }
    }, 30); // 30ms par mot
    
    return () => clearInterval(interval);
  }, [content, isStreaming]);
  
  return (
    <div className="text-gray-800">
      {displayedContent}
      {isStreaming && <span className="animate-pulse">▊</span>}
    </div>
  );
}
```

**Implémentation complète**:

```tsx
// Composant ThinkingIndicator
interface ThinkingIndicatorProps {
  phases: {
    label: string;
    status: 'pending' | 'active' | 'completed';
  }[];
  estimatedTime?: number;
}

function ThinkingIndicator({ phases, estimatedTime }: ThinkingIndicatorProps) {
  const activePhase = phases.find(p => p.status === 'active');
  const completedCount = phases.filter(p => p.status === 'completed').length;
  const progress = (completedCount / phases.length) * 100;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 p-4"
    >
      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-gray-900">Nia is thinking</span>
          <span className="text-xs text-gray-400">
            {estimatedTime && `~${Math.ceil(estimatedTime / 1000)}s`}
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden mb-3">
          <motion.div 
            className="h-full bg-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        
        {/* Phases */}
        <div className="space-y-1">
          {phases.map((phase, index) => (
            <div 
              key={index}
              className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                phase.status === 'completed' && "text-green-600",
                phase.status === 'active' && "text-blue-600",
                phase.status === 'pending' && "text-gray-400"
              )}
            >
              {phase.status === 'completed' ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : phase.status === 'active' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-gray-300" />
              )}
              <span>{phase.label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// Usage
<ThinkingIndicator 
  phases={[
    { label: 'Analyzing target', status: 'completed' },
    { label: 'Planning approach', status: 'active' },
    { label: 'Deploying agents', status: 'pending' },
  ]}
  estimatedTime={15000}
/>
```

---

#### ✅ DÉJÀ IMPLÉMENTÉ - Aucun travail requis

**Status**: Complètement fonctionnel dans la codebase

**Composants existants** :
- ✅ `StreamingText` dans `components/pentest/swarm-ui-components.tsx` (word-by-word animation)
- ✅ Blinking cursor dans `chat-messages.tsx`
- ✅ Thinking indicator dots dans `active-screen.tsx`
- ✅ Agent status glyphs (THINKING, RUNNING_TOOL, SPAWNED, DONE, FAILED) dans `AgentCard.tsx`
- ✅ Mini HUD avec pulsing dots dans `SwarmMiniHUD.tsx`
- ✅ Progress bars animés dans `AgentCard.tsx`
- ✅ Findings Agent Status avec rotating border dans `active-screen.tsx`
- ✅ Tool execution progress avec lightsaber animation dans `active-screen.tsx`
- ✅ Todo status icons avec animations dans `active-screen.tsx`

**Aucune modification nécessaire** - Tout est déjà en place et fonctionnel.

---

**🤖 Déploiement agents requis : 4 sous-agents** (Original - Non nécessaire car déjà implémenté)
- **Agent #4 - Backend/Stream Processing** (Node.js - buffering tokens, gestion backpressure, rate limiting)

---

### 🎨 3.4 Formatage des Sorties Techniques

#### Problème identifié
Les résultats de commandes (nmap, nikto, etc.) sont affichés en texte brut sans formatage. C'est illisible pour des outputs techniques longs et complexes.

#### Impact utilisateur
- **Lisibilité nulle**: Impossible de scanner rapidement les résultats
- **Manque de contexte**: Pas de coloration syntaxique
- **Productivité**: Doit parser manuellement les informations
- **Professionnalisme**: Rendu amateur comparé aux outils CLI modernes

#### Benchmark concurrentiel

**GitHub Copilot Chat**:
- Code blocks avec syntax highlighting
- Language detection automatique
- Copy button sur chaque bloc
- Collapsible pour les longs outputs

**Warp Terminal**:
- Outputs structurés en blocs
- Commandes séparées des résultats
- Badges et tags colorés
- Recherche dans l'historique

**Datadog / Monitoring tools**:
- Tableaux pour les métriques
- Graphiques inline
- Alertes visuelles (rouge/orange/vert)
- Export JSON/CSV

#### Spécification fonctionnelle

**Composants nécessaires**:

**1. Code Block avec Syntax Highlighting**:
```tsx
interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

function CodeBlock({ code, language, filename, showLineNumbers }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden my-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-sm font-mono text-gray-600">{filename}</span>
          )}
          {language && (
            <span className="text-xs px-2 py-0.5 bg-gray-200 rounded text-gray-600">
              {language}
            </span>
          )}
        </div>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      
      {/* Code */}
      <div className="relative">
        {showLineNumbers && (
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gray-50 border-r border-gray-200 
            flex flex-col items-center py-4 text-xs text-gray-400 font-mono">
            {code.split('\n').map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        )}
        <pre className={cn(
          "p-4 overflow-x-auto text-sm font-mono bg-white",
          showLineNumbers && "pl-16"
        )}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
```

**2. Tableau de résultats (style nmap)**:
```
┌─ Port Scan Results ─────────────────────────────────────┐
│                                                          │
│  PORT      STATE    SERVICE       VERSION               │
│  ─────────────────────────────────────────────────────  │
│  22/tcp    open     ssh           OpenSSH 8.9p1         │
│  80/tcp    open     http          Apache httpd 2.4.41   │
│  443/tcp   open     https         nginx 1.18.0          │
│  3306/tcp  open     mysql         MySQL 8.0.32          │
│  8080/tcp  open     http-proxy    -                     │
│                                                          │
│  [View details] [Export CSV] [Copy]                     │
└─────────────────────────────────────────────────────────┘
```

**3. Badges de sévérité**:
```tsx
const severityConfig = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: AlertOctagon },
  high: { color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  medium: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertCircle },
  low: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Info },
  info: { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: Info },
};

function SeverityBadge({ severity, cvss }: { severity: string; cvss?: number }) {
  const config = severityConfig[severity] || severityConfig.info;
  const Icon = config.icon;
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
      config.color
    )}>
      <Icon className="w-3.5 h-3.5" />
      <span className="capitalize">{severity}</span>
      {cvss && <span className="opacity-75">({cvss})</span>}
    </span>
  );
}
```

**4. Section collapsible**:
```tsx
function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden my-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="font-medium text-sm text-gray-900">{title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

**🤖 Déploiement agents requis : 5 sous-agents**
- **Agent #1 - Frontend/Code Display** (React/PrismJS - composant CodeBlock, syntax highlighting, line numbers, copy button)
- **Agent #2 - Frontend/Data Tables** (React/Tailwind - tableaux formatés, tri, filtres, pagination pour résultats nmap)
- **Agent #3 - Frontend/Visualization** (React - SeverityBadge, collapsible sections, cards techniques)
- **Agent #4 - Backend/Parsing Engine** (Node.js/Regex - parsers nmap, nikto, gobuster vers JSON structuré)
- **Agent #5 - Backend/Formatting Service** (Node.js - transformation données brutes en composants UI-ready)

---

### ⚡ 3.5 Quick Actions et Suggestions

#### Problème identifié
L'utilisateur arrive sur une interface vide sans idée de quoi demander. L'input placeholder est trop générique ("Start a pentest or ask a question...").

#### Impact utilisateur
- **Blocage**: Ne sait pas par où commencer
- **Courbe d'apprentissage**: Doit deviner les capacités du système
- **Adoption**: Risque d'abandon si pas guidé
- **Efficacité**: Prompts non optimaux = résultats médiocres

#### Benchmark concurrentiel

**ChatGPT**:
- Suggestions contextuelles basées sur l'historique
- Prompts starters pré-définis
- Capacités découvrables progressivement

**Claude**:
- "What can Claude do?" helper
- Exemples de prompts dans l'empty state
- Project templates pour les cas d'usage courants

**Perplexity**:
- Focus areas (Academic, Writing, etc.)
- Recent searches
- Trending topics

#### Spécification fonctionnelle

**1. Suggestions sous l'input**:
```tsx
const quickActions = [
  { 
    icon: Zap, 
    label: 'Quick scan',
    prompt: 'Run a quick security scan on {target}' 
  },
  { 
    icon: Search, 
    label: 'Deep recon',
    prompt: 'Perform deep reconnaissance on {target} including subdomain enumeration' 
  },
  { 
    icon: Bug, 
    label: 'XSS focus',
    prompt: 'Focus on finding XSS vulnerabilities in {target}' 
  },
  { 
    icon: Shield, 
    label: 'Full audit',
    prompt: 'Run a comprehensive security audit on {target}' 
  },
];

function QuickActions({ onAction, target }) {
  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-400 mb-2">Quick actions</p>
      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.prompt.replace('{target}', target))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 
              rounded-full text-xs text-gray-700 transition-colors"
          >
            <action.icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**2. Empty state amélioré**:
```tsx
function EmptyState({ onSuggestion }) {
  const suggestions = [
    { icon: Target, text: 'Scan example.com for vulnerabilities', prompt: 'Scan example.com' },
    { icon: Globe, text: 'Enumerate subdomains of target.com', prompt: 'Enumerate subdomains of target.com' },
    { icon: Shield, text: 'Check security headers on api.site.com', prompt: 'Check security headers on api.site.com' },
  ];
  
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E09500] 
        flex items-center justify-center mb-6">
        <Shield className="w-8 h-8 text-white" />
      </div>
      
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Welcome to Aegis Pentest
      </h2>
      
      <p className="text-sm text-gray-500 max-w-md mb-8">
        I can help you discover vulnerabilities, map attack surfaces, 
        and generate comprehensive security reports.
      </p>
      
      <div className="space-y-2 w-full max-w-md">
        <p className="text-xs text-gray-400 uppercase tracking-wider text-left mb-3">
          Try asking
        </p>
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSuggestion(suggestion.prompt)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 
              hover:border-[#F5A623] hover:bg-[#F5A623]/5 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 group-hover:bg-[#F5A623]/10 
              flex items-center justify-center transition-colors">
              <suggestion.icon className="w-5 h-5 text-gray-500 group-hover:text-[#F5A623]" />
            </div>
            <span className="text-sm text-gray-700">{suggestion.text}</span>
            <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-[#F5A623]" />
          </button>
        ))}
      </div>
    </div>
  );
}
```

**3. Commandes slash**:
```tsx
// Support pour /commands comme Discord/Slack
const slashCommands = [
  { command: '/scan', description: 'Start a security scan', params: ['target'] },
  { command: '/findings', description: 'Show all findings', params: [] },
  { command: '/report', description: 'Generate report', params: ['format'] },
  { command: '/stop', description: 'Stop all agents', params: [] },
  { command: '/status', description: 'Show pentest status', params: [] },
];

// Autocomplete dropdown quand on tape "/"
```

---

**🤖 Déploiement agents requis : 4 sous-agents**
- **Agent #1 - Frontend/Quick Actions UI** (React/Tailwind - composant QuickActions, chips, boutons contextuels)
- **Agent #2 - Frontend/Empty State** (React - EmptyState redesign, suggestions cliquables, onboarding visuel)
- **Agent #3 - Frontend/Autocomplete** (React/TypeScript - slash commands, dropdown intelligent, keyboard navigation)
- **Agent #4 - Frontend/Prompt Engineering** (React - suggestions dynamiques basées sur contexte, ML local pour recommendations)

---

### 🔍 3.6 Recherche et Filtres

#### Problème identifié
Impossible de chercher dans les messages ou de filtrer les findings/agents. Dans un pentest long avec des centaines de messages, retrouver une information spécifique est impossible.

#### Spécification fonctionnelle

**Features requises**:
- Barre de recherche globale (⌘+K) pour trouver dans tous les messages
- Filtres par type (user/assistant/agent), date, contenu
- Highlight des résultats de recherche
- Recherche dans les findings (par sévérité, type, port)

**Composants nécessaires**:
```tsx
// SearchModal - Overlay avec recherche temps réel
// MessageFilter - Filtres par type/date
// FindingsFilter - Filtres par CVSS/categorie
```

---

**🤖 Déploiement agents requis : 4 sous-agents**
- **Agent #1 - Frontend/Search UI** (React/Tailwind - SearchModal, input search, ⌘+K shortcut, résultats temps réel)
- **Agent #2 - Frontend/Filters** (React - MessageFilter, FindingsFilter, UI filtres combinés)
- **Agent #3 - Frontend/Highlight** (React - highlight mots recherchés, scroll to result, animations)
- **Agent #4 - Backend/Search Engine** (Node.js/PostgreSQL - full-text search, indexes GIN, trigram, ranking)

---

### 📎 3.7 Gestion des Fichiers

#### Problème identifié
Pas de support pour upload/download de fichiers. Impossible d'uploader une liste de cibles, de télécharger un rapport, ou de partager des fichiers de scope.

#### Spécification fonctionnelle

**Features requises**:
- Drag & drop de fichiers dans l'input
- Upload progress indicator
- Preview des fichiers (scope lists, previous scans)
- Download des rapports directement dans le chat
- Support formats: .txt, .csv, .json, .yaml, .pdf

**Composants nécessaires**:
```tsx
// FileUploadZone - Zone de drop
// FileAttachment - Preview fichier attaché
// FileList - Liste des fichiers uploadés
```

---

**🤖 Déploiement agents requis : 5 sous-agents**
- **Agent #1 - Frontend/Drop Zone** (React/HTML5 - drag & drop, zone de drop visuelle, feedback visuel)
- **Agent #2 - Frontend/File Preview** (React - prévisualisation fichiers, icônes par type, suppression)
- **Agent #3 - Frontend/Progress** (React - barres de progression, upload multiple, annulation)
- **Agent #4 - Backend/Upload API** (Node.js/Multer - endpoints upload, validation MIME, virus scan)
- **Agent #5 - DevOps/Storage** (AWS S3/MinIO - buckets, policies CORS, signed URLs, lifecycle)

---

### 🔄 3.8 États d'Erreur et Retry

#### Problème identifié
Pas de gestion visible des erreurs. Quand un agent échoue ou la connexion est perdue, l'UI semble bloquée sans explication.

#### Spécification fonctionnelle

**Features requises**:
- Message d'erreur explicite avec contexte
- Bouton "Retry" sur les messages failed
- Reconnexion automatique avec backoff
- Fallback UI quand un agent crash
- Network status indicator (online/offline)

**Composants nécessaires**:
```tsx
// ErrorBoundary - Capture erreurs React
// RetryButton - Bouton retry avec compteur
// NetworkStatus - Indicateur connexion
// ErrorToast - Notifications d'erreur
```

---

**🤖 Déploiement agents requis : 4 sous-agents**
- **Agent #1 - Frontend/Error UI** (React - ErrorBoundaries, fallback components, error cards visuelles)
- **Agent #2 - Frontend/Toast System** (React - notification system, retry buttons, auto-dismiss)
- **Agent #3 - Backend/Resilience** (Node.js - circuit breakers, exponential backoff, dead letter queue)
- **Agent #4 - Backend/Health Monitoring** (Node.js - health checks, auto-recovery, status endpoints)

---

### 🎛️ 3.9 Contrôle de la Conversation

#### Problème identifié
L'utilisateur n'a pas de contrôle sur le flux du pentest. Impossible de pause, stop, ou modifier la direction en cours de route.

#### Spécification fonctionnelle

**Features requises**:
- Bouton Pause/Resume global
- Bouton Stop pour arrêter un agent spécifique
- Bouton Skip pour passer une phase
- "Branching" - poser une question en parallèle
- Indicateur de contrôles disponibles

**Composants nécessaires**:
```tsx
// ConversationControls - Barre de contrôle global
// AgentControlMenu - Menu par agent (stop/pause)
// BranchPrompt - Input pour questions parallèles
```

---

**🤖 Déploiement agents requis : 4 sous-agents**
- **Agent #1 - Frontend/Control UI** (React/Tailwind - boutons pause/stop/skip, tooltips, confirmation modals)
- **Agent #2 - Frontend/Branching** (React - input secondaire pour questions parallèles, thread switching)
- **Agent #3 - Backend/State Machine** (Node.js - machine à états agents, transitions sécurisées)
- **Agent #4 - Backend/Signal Handling** (Node.js - WebSocket signals, broadcast pause/stop, ACK protocol)

---

### 🔔 3.10 Notifications et Alertes

#### Problème identifié
Notifications basiques uniquement. L'utilisateur rate des événements importants (findings critiques, agents qui terminent).

#### Spécification fonctionnelle

**Features requises**:
- Toast notifications pour findings CVSS 9+
- Badge pulsant sur l'onglet navigateur
- Son pour alertes critiques (optionnel)
- Notifications navigateur (Web Push)
- Centre de notifications historique

**Composants nécessaires**:
```tsx
// ToastContainer - Container de toasts
// NotificationCenter - Historique notifications
// TabBadge - Badge sur le titre de l'onglet
// SoundAlert - Gestion des sons
```

---

**🤖 Déploiement agents requis : 5 sous-agents**
- **Agent #1 - Frontend/Toast System** (React - toast container, positioning, stacking, auto-dismiss)
- **Agent #2 - Frontend/Badges & Indicators** (React - tab badges, favicon updates, title notifications)
- **Agent #3 - Frontend/Web Push** (React/SW - service worker, push notifications, permission handling)
- **Agent #4 - Backend/Notification Service** (Node.js - queue de notifications, prioritisation, templates)
- **Agent #5 - Backend/Events Bus** (Node.js - WebSocket events, pub/sub, real-time delivery)

---

### 🎨 3.11 Personnalisation et Thèmes

#### Problème identifié
Pas de personnalisation possible. Dark mode manquant, pas de choix de couleurs, taille de police fixe.

#### Spécification fonctionnelle

**Features requises**:
- Toggle Dark/Light mode
- Sélection de l'accent color
- Font size adjustment (small/medium/large)
- Dense/Comfortable spacing toggle
- Preferences persistence (localStorage)

**Composants nécessaires**:
```tsx
// ThemeProvider - Contexte de thème
// ThemeToggle - Bouton dark/light
// PreferencesPanel - Panel de réglages
```

---

**🤖 Déploiement agents requis : 3 sous-agents**
- **Agent #1 - Frontend/Theme Core** (React - ThemeProvider, context React, localStorage persistence)
- **Agent #2 - Frontend/CSS Architecture** (Tailwind - configuration darkMode, CSS variables dynamiques, transitions)
- **Agent #3 - Frontend/Preferences UI** (React - panel réglages, toggles, sélecteurs couleur/taille/espacement)

---

### 📊 3.12 Dashboard et Analytics

#### Problème identifié
Vue très limitée des métriques. Pas de visibilité sur le temps écoulé, le nombre de commandes, le taux de réussite.

#### Spécification fonctionnelle

**Features requises**:
- Temps écoulé du pentest
- Nombre de commandes exécutées
- Taux de réussite des agents
- Graph de progression par phase
- Stats temps réel (findings/minute)
- Timeline des événements

**Composants nécessaires**:
```tsx
// PentestStats - Métriques clés
// ProgressChart - Graphique de progression
// EventTimeline - Timeline des événements
// AgentSuccessRate - Taux de réussite
```

---

**🤖 Déploiement agents requis : 5 sous-agents**
- **Agent #1 - Frontend/Charts & Graphs** (React/Recharts - visualisations métriques, line charts, pie charts, tooltips)
- **Agent #2 - Frontend/Timeline** (React - timeline interactive des événements, scroll, filtres temporels)
- **Agent #3 - Frontend/Real-time Stats** (React - compteurs temps réel, findigs/minute, widgets live)
- **Agent #4 - Backend/Metrics Aggregation** (Node.js - agrégation events, calculs statistiques, rollups)
- **Agent #5 - Backend/Time-series DB** (Node.js/InfluxDB - stockage métriques, queries optimisées, retention)

---

### 🚀 3.13 Onboarding et Empty States ✅

#### Problème identifié
Premier contact peu engageant. L'utilisateur arrive sur une interface vide sans guidance.

#### Spécification fonctionnelle

**Features requises**:
- Welcome message interactif
- Tutorial guidé step-by-step (tour.js)
- Exemples de prompts cliquables
- Demo mode avec données simulées
- Empty states informatifs pour chaque section
- Tooltips contextuels

**Composants nécessaires**:
```tsx
// OnboardingTour - Tour guidé interactif
// WelcomeModal - Modal de bienvenue
// DemoDataLoader - Chargement données démo
// TooltipGuide - Tooltips contextuels
```

---

#### ✅ Implémentation Réalisée (16 Mars 2026)

**1. Empty State avec suggestions** (`components/chat/empty-state.tsx`)

Nouveau composant créé avec :
- ✅ Design avec icône Shield et dégradé (#F5A623 → #E09500)
- ✅ Titre "Start a Security Assessment"
- ✅ 3 cartes de suggestions cliquables :
  - 🌐 Web App Scan → "Scan the web application at "
  - ⚡ API Security → "Test the API security of "
  - 🖧 Network Recon → "Perform network reconnaissance on "
- ✅ Callback `onSuggestionClick` pour préremplir l'input
- ✅ Style responsive avec grid
- ✅ Hints clavier (⏎ to send · Shift+⏎ new line)

```typescript
interface EmptyStateProps {
  onSuggestionClick?: (suggestion: string) => void;
}
```

**2. Tooltips dans Config Screen** (`components/pentest/config-screen.tsx`)

- ✅ Composant `FieldTooltip` créé
- ✅ Wrapper `TooltipProvider` ajouté
- ✅ Imports Tooltip de `@/components/ui/tooltip`
- ✅ Structure prête pour ajouter des tooltips sur tous les champs

**Fichiers créés/modifiés**:
- ✅ `lea-app/components/chat/empty-state.tsx` (nouveau)
- ✅ `lea-app/components/pentest/config-screen.tsx` (modifié)

---

**🤖 Déploiement agents requis : 4 sous-agents** (Original - Non utilisé car implémentation directe)

---

## 4. Recommandations d'implémentation

### Phase 1: Fondations (1-2 semaines)

**Priorité CRITIQUE**:
1. **Actions sur les messages** (Copy, Regenerate)
   - Effort: 2-3 jours
   - Impact: ⭐⭐⭐⭐⭐
   - Fichiers: `components/chat/message-item.tsx`

2. **Typing indicator** (streaming basique)
   - Effort: 1-2 jours
   - Impact: ⭐⭐⭐⭐⭐
   - Fichiers: `app/pentest/page.tsx`

3. **Quick actions** (sous l'input)
   - Effort: 1 jour
   - Impact: ⭐⭐⭐⭐
   - Fichiers: `components/chat/chat-input.tsx`

### Phase 2: Navigation (2-3 semaines)

**Priorité HAUTE**:
4. **Historique des conversations**
   - Effort: 5-7 jours
   - Impact: ⭐⭐⭐⭐⭐
   - Fichiers: `components/layout/left-sidebar.tsx`, API backend

5. **Recherche dans messages**
   - Effort: 2-3 jours
   - Impact: ⭐⭐⭐
   - Fichiers: `components/chat/message-list.tsx`

6. **Empty state amélioré**
   - Effort: 1 jour
   - Impact: ⭐⭐⭐
   - Fichiers: `components/chat/message-list.tsx`

### Phase 3: Rich Content (3-4 semaines)

**Priorité MOYENNE**:
7. **Syntax highlighting** pour code/commands
   - Effort: 3-4 jours
   - Impact: ⭐⭐⭐⭐
   - Fichiers: Nouveau composant `components/ui/code-block.tsx`

8. **Tableaux et formatage technique**
   - Effort: 3-4 jours
   - Impact: ⭐⭐⭐⭐
   - Fichiers: `components/chat/message-item.tsx`

9. **Upload de fichiers**
   - Effort: 2-3 jours
   - Impact: ⭐⭐⭐
   - Fichiers: `components/chat/chat-input.tsx`

### Phase 4: Polish (2 semaines)

**Nice to have**:
10. **Dark mode**
    - Effort: 2-3 jours
    - Impact: ⭐⭐
    - Fichiers: `app/globals.css`, tailwind.config.ts

11. **Notifications avancées**
    - Effort: 2 jours
    - Impact: ⭐⭐
    - Fichiers: `hooks/use-notifications.ts`

12. **Dashboard analytics**
    - Effort: 3-4 jours
    - Impact: ⭐⭐
    - Fichiers: Nouveau composant

---

## 5. Comparatif avec les leaders du marché

### Matrice de fonctionnalités

| Fonctionnalité | LEA Actuel | ChatGPT | Claude | Grok | Priorité |
|----------------|-----------|---------|---------|------|----------|
| Historique conversations | ❌ | ✅ | ✅ | ✅ | 🔴 Critique |
| Copy message | ❌ | ✅ | ✅ | ✅ | 🔴 Critique |
| Regenerate | ❌ | ✅ | ✅ | ❌ | 🔴 Critique |
| Edit message | ❌ | ✅ | ✅ | ❌ | 🟠 Haute |
| Typing indicator | ❌ | ✅ | ✅ | ✅ | 🔴 Critique |
| Streaming text | ❌ | ✅ | ✅ | ✅ | 🟠 Haute |
| Syntax highlighting | ❌ | ✅ | ✅ | ✅ | 🟠 Haute |
| Quick actions | ❌ | ✅ | ✅ | ✅ | 🔴 Critique |
| Slash commands | ❌ | ❌ | ❌ | ✅ | 🟡 Moyenne |
| File upload | ❌ | ✅ | ✅ | ❌ | 🟠 Haute |
| Dark mode | ❌ | ✅ | ✅ | ✅ | 🟡 Moyenne |
| Search | ❌ | ✅ | ✅ | ✅ | 🟠 Haute |
| Export | ❌ | ✅ | ✅ | ❌ | 🟡 Moyenne |
| Mobile responsive | ✅ | ✅ | ✅ | ✅ | ✅ OK |

---

## 6. Wireframes et spécifications

### 6.1 Layout recommandé (v2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Aegis                                [Search...]              [🔔] [👤]   │
├──────────┬──────────────────────────────────────────────────────┬───────────┤
│          │  Phase: [Recon]→[Enum]→[Exploit]→[Report]  [Tasks ▼] │           │
│ [New     │                                                       │ Agent     │
│  Pentest]│  ┌─────────────────────────────────────────────────┐  │ Tasks     │
│          │  │ [Avatar] Welcome! How can I help you today?     │  │ ───────── │
│ Recent   │  └─────────────────────────────────────────────────┘  │           │
│ ──────── │                                                       │ Port      │
│ Pentest  │  ┌─────────────────────────────────────────────────┐  │ Scanner   │
│ example  │  │ [User] Scan example.com for vulnerabilities     │  │ [████░░]  │
│ .com     │  └─────────────────────────────────────────────────┘  │           │
│ (2h ago) │                                                       │ Web       │
│          │  ┌─────────────────────────────────────────────────┐  │ Crawler   │
│ Pentest  │  │ [Avatar] I'll deploy reconnaissance agents...   │  │ [██░░░░]  │
│ api.targ │  └─────────────────────────────────────────────────┘  │           │
│ et.io    │                                                       │           │
│ (1d ago) │  ┌─────────────────────────────────────────────────┐  │           │
│          │  │ [AGENT CARD] Port Scanner                       │  │           │
│ Settings │  │ [████████░░] 80% complete                       │  │           │
│ [Provider│  │ 3 findings discovered                           │  │           │
│ s]       │  └─────────────────────────────────────────────────┘  │           │
│          │                                                       │           │
│ [User    │  [Quick actions: 🔍 Quick scan] [🎯 Deep scan]       │           │
│  Profil  │                                                       │           │
e]        │  ┌─────────────────────────────────────────────────┐  │           │
│          │  │ [Input...                                   ] [⬆]│  │           │
│          │  │ [📎] [Stealth ▼]                                  │  │           │
│          │  └─────────────────────────────────────────────────┘  │           │
│          │                                                       │           │
└──────────┴───────────────────────────────────────────────────────┴───────────┘
```

### 6.2 Message avec actions

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Avatar] Nia                                    [⋯] [🔄]   │
│                                                             │
│  I'll help you scan example.com for vulnerabilities.        │
│  Let me deploy the reconnaissance agents.                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Quick Actions:                                      │   │
│  │ [Quick port scan] [Full vulnerability scan]         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Deploying Port Scanner...]  [View logs ↗]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Agent card enrichi

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Port Scanner                              [⏹ Stop] [📋] │
├─────────────────────────────────────────────────────────────┤
│ Status: Running (80%)                           [████████░░]│
│                                                             │
│ Task: TCP SYN scan on ports 1-65535                         │
│                                                             │
│ Progress:                                                   │
│ ✓ Host discovery     ✓ Port scanning     ○ Service detection│
│                                                             │
│ Findings:                                                   │
│ 🔴 CRITICAL  22/tcp OpenSSH 8.9p1 (CVE-2023-1234)          │
│ 🟡 MEDIUM    3306/tcp MySQL exposed                         │
│                                                             │
│ [View details] [Export CSV] [Dismiss]                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Métriques de succès

Pour mesurer l'amélioration de l'UX, suivre ces métriques:

### Engagement
- **Messages par session**: Objectif +50%
- **Temps moyen sur l'app**: Objectif +30%
- **Taux de retour**: Objectif +40%

### Satisfaction
- **Tâches complétées**: Objectif +60%
- **Taux d'abandon**: Objectif -30%
- **Copy actions**: Mesurer l'utilité

### Performance
- **Temps de réponse perçu**: < 500ms (feedback immédiat)
- **Streaming fluidité**: 30ms par mot
- **FPS animations**: > 60fps

---

## 🎯 Conclusion

L'interface actuelle de LEA a une solide fondation avec:
- ✅ Layout moderne à 3 colonnes
- ✅ Système de messages fonctionnel
- ✅ Animations fluides
- ✅ Design épuré et professionnel

**Mais il manque des fonctionnalités critiques pour une expérience chatbot**:
1. **Historique** pour la continuité
2. **Actions sur messages** pour le contrôle
3. **Indicateurs de progression** pour la confiance
4. **Formatage riche** pour la lisibilité
5. **Guidage utilisateur** pour l'adoption

**Recommandation**: Commencer par la Phase 1 (actions messages + typing indicator + quick actions) pour un impact immédiat fort avec un effort raisonnable.

---

**Document rédigé par**: Sisyphus AI  
**Date de mise à jour**: 15 Mars 2026  
**Version**: 1.0
