# Guide UI/UX — Inspiration zcode & AI IDEs Modernes

> **Version** : 1.0.0
> **Date** : Février 2025
> **Objectif** : Créer une application Electron au design sobre, noir, rond, moderne et épuré

---

## 1. Vision Design

### 1.1 Philosophie

L'interface doit refléter une **esthétique cyber/hacker professionnelle**, inspirée de :
- **zcode** : Interface ADE moderne, thème sombre, intégration fluide
- **Claude Code** : Minimalisme, efficacité, streaming naturel
- **Cursor** : Design épuré, focus sur le code
- **Kimi K2.5** : Avatars ASCII pixel art, style badge

### 1.2 Principes Directeurs

| Principe | Description |
|----------|-------------|
| **Minimalisme** | Éliminer tout élément superflu |
| **Sombre** | Thème dark par défaut, confort visuel |
| **Rond** | Coins arrondis, bulles, fluidité |
| **Épuré** | Espace blanc, hiérarchie claire |
| **Moderne** | Effets subtils, animations fluides |

---

## 2. Système de Design

### 2.1 Palette de Couleurs

```css
:root {
  /* === FONDS === */
  --bg-void: #000000;           /* Noir pur */
  --bg-primary: #0a0a0b;        /* Noir légèrement éclairci */
  --bg-secondary: #141416;      /* Cartes, panels */
  --bg-elevated: #1c1c1f;       /* Éléments surélevés */
  --bg-surface: #242428;        /* Surfaces interactives */
  --bg-hover: #2a2a2e;          /* Hover states */
  
  /* === TEXTE === */
  --text-primary: #ffffff;      /* Texte principal */
  --text-secondary: #a0a0a8;    /* Texte secondaire */
  --text-tertiary: #6b6b73;     /* Texte tertiaire */
  --text-muted: #48484f;        /* Texte atténué */
  
  /* === ACCENTS === */
  --accent-purple: #8b5cf6;     /* Primary accent */
  --accent-cyan: #00d4ff;       /* Secondary accent */
  --accent-green: #00ff9f;      /* Success */
  --accent-red: #ff4757;        /* Error */
  --accent-yellow: #ffd93d;     /* Warning */
  --accent-blue: #3b82f6;       /* Info */
  
  /* === GLOW EFFECTS === */
  --glow-purple: rgba(139, 92, 246, 0.4);
  --glow-cyan: rgba(0, 212, 255, 0.4);
  --glow-green: rgba(0, 255, 159, 0.4);
}
```

### 2.2 Typographie

```css
:root {
  /* === FAMILLES === */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  
  /* === TAILLES === */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;
  
  /* === LINE HEIGHTS === */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
  
  /* === LETTER SPACING === */
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
}
```

### 2.3 Espacements

```css
:root {
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### 2.4 Coins Arrondis

```css
:root {
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-2xl: 28px;
  --radius-full: 9999px;
}
```

### 2.5 Ombres et Effets

```css
:root {
  /* === SHADOWS === */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.6);
  
  /* === GLOW === */
  --glow-sm: 0 0 10px var(--glow-purple);
  --glow-md: 0 0 20px var(--glow-purple);
  --glow-lg: 0 0 40px var(--glow-purple);
  
  /* === BLUR === */
  --blur-sm: blur(4px);
  --blur-md: blur(8px);
  --blur-lg: blur(16px);
  --blur-xl: blur(24px);
}
```

---

## 3. Composants UI

### 3.1 Layout Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│ ╭─ Header ───────────────────────────────────────────────────────╮ │
│ │  [Logo]     [Navigation Tabs]              [Theme] [Settings]  │ │
│ ╰────────────────────────────────────────────────────────────────╯ │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────────────────────┐  ┌──────────────────┐  │
│  │          │  │                          │  │                  │  │
│  │ Sidebar  │  │      Main Content        │  │   Right Panel    │  │
│  │  Left    │  │                          │  │   (optional)     │  │
│  │          │  │                          │  │                  │  │
│  │  260px   │  │        flex: 1           │  │      300px       │  │
│  │          │  │                          │  │                  │  │
│  └──────────┘  └──────────────────────────┘  └──────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Header

```tsx
// Design du header
<header className="h-14 border-b border-white/5 bg-black/50 backdrop-blur-xl">
  <div className="flex items-center justify-between h-full px-6">
    {/* Logo */}
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500" />
      <span className="text-sm font-semibold">LEA</span>
    </div>
    
    {/* Navigation */}
    <nav className="flex items-center gap-1">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={cn(
            "px-4 py-2 text-sm rounded-full transition-all",
            active === tab.id 
              ? "bg-white/10 text-white" 
              : "text-gray-400 hover:text-white hover:bg-white/5"
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
    
    {/* Actions */}
    <div className="flex items-center gap-2">
      <button className="p-2 rounded-full hover:bg-white/5">
        <MoonIcon className="w-4 h-4" />
      </button>
      <button className="p-2 rounded-full hover:bg-white/5">
        <SettingsIcon className="w-4 h-4" />
      </button>
    </div>
  </div>
</header>
```

### 3.3 Carte (Card)

```tsx
// Carte moderne avec effet de profondeur
<div className="
  relative
  bg-gradient-to-b from-white/[0.03] to-transparent
  border border-white/[0.06]
  rounded-2xl
  p-6
  transition-all duration-300
  hover:border-white/[0.1]
  hover:bg-white/[0.04]
">
  {/* Glow effect on hover */}
  <div className="
    absolute inset-0 rounded-2xl
    bg-gradient-to-r from-purple-500/0 via-cyan-500/0 to-purple-500/0
    opacity-0 hover:opacity-100
    transition-opacity duration-500
  " />
  
  {/* Content */}
  <div className="relative z-10">
    {children}
  </div>
</div>
```

### 3.4 Boutons

```tsx
// Bouton primaire
<button className="
  px-6 py-2.5
  bg-white text-black
  rounded-full
  font-medium text-sm
  transition-all duration-200
  hover:bg-gray-200
  active:scale-[0.98]
">
  Primary
</button>

// Bouton secondaire
<button className="
  px-6 py-2.5
  bg-white/5 text-white
  rounded-full
  font-medium text-sm
  border border-white/10
  transition-all duration-200
  hover:bg-white/10 hover:border-white/20
  active:scale-[0.98]
">
  Secondary
</button>

// Bouton ghost
<button className="
  px-4 py-2
  text-gray-400
  rounded-full
  text-sm
  transition-all duration-200
  hover:text-white hover:bg-white/5
">
  Ghost
</button>
```

### 3.5 Input

```tsx
// Input moderne
<div className="relative">
  <input
    type="text"
    className="
      w-full px-4 py-3
      bg-white/[0.03]
      border border-white/[0.08]
      rounded-xl
      text-white text-sm
      placeholder:text-gray-500
      transition-all duration-200
      focus:outline-none focus:border-purple-500/50
      focus:bg-white/[0.05]
      focus:ring-4 focus:ring-purple-500/10
    "
    placeholder="Enter target..."
  />
  
  {/* Focus glow */}
  <div className="
    absolute inset-0 rounded-xl
    pointer-events-none
    opacity-0
    group-focus-within:opacity-100
    transition-opacity
    ring-4 ring-purple-500/20
  " />
</div>
```

### 3.6 Badge / Tag

```tsx
// Badge moderne
<span className="
  inline-flex items-center gap-1.5 px-3 py-1
  rounded-full
  text-xs font-medium
  bg-purple-500/10 text-purple-400
  border border-purple-500/20
">
  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
  Active
</span>

// Badge sévérité (findings)
<span className={cn(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
  severity === 'Critical' && "bg-red-500/10 text-red-400 border border-red-500/20",
  severity === 'High' && "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  severity === 'Medium' && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  severity === 'Low' && "bg-green-500/10 text-green-400 border border-green-500/20",
)}>
  {severity}
</span>
```

### 3.7 Avatar ASCII

```tsx
// Avatar ASCII style Kimi K2.5
const ASCII_AVATARS = {
  coordinator: `
  ▓▓▓▓▓▓▓▓
  ▓● ●▓
  ▓ ══ ▓
  ▓▀▀▀▀▀▀▓
  ▓COORD▓
  ▓▓▓▓▓▓▓▓
  `,
  scanner: `
  ▓▓▓▓▓▓▓▓
  ▓▀██▀▓
  ▓ ▄▄ ▓
  ▓▀▀▀▀▀▀▓
  ▓SCAN▓
  ▓▓▓▓▓▓▓▓
  `
};

// Composant Avatar
function AsciiAvatar({ role, isActive }: { role: string; isActive: boolean }) {
  const { art, color } = getAsciiAvatar(role);
  
  return (
    <div className={cn(
      "relative p-3 rounded-xl transition-all duration-300",
      isActive && "bg-white/[0.03]"
    )}>
      {/* Glow pour agent actif */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-xl blur-xl"
          style={{ background: `${color}20` }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      
      {/* ASCII Art */}
      <pre
        className="text-[7px] leading-[7px] font-mono whitespace-pre"
        style={{ color }}
      >
        {art}
      </pre>
      
      {/* Indicateur actif */}
      {isActive && (
        <motion.div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}
```

### 3.8 Messages Chat

```tsx
// Message utilisateur
<div className="flex justify-end mb-4">
  <div className="
    max-w-[80%] px-4 py-3
    bg-purple-500/10
    border border-purple-500/20
    rounded-2xl rounded-br-md
    text-sm text-white
  ">
    {content}
  </div>
</div>

// Message assistant avec streaming
<div className="flex gap-3 mb-4">
  {/* Avatar */}
  <div className="flex-shrink-0">
    <AsciiAvatar role="coordinator" isActive={isStreaming} />
  </div>
  
  {/* Content */}
  <div className="
    flex-1 px-4 py-3
    bg-white/[0.02]
    border border-white/[0.05]
    rounded-2xl rounded-tl-md
  ">
    <div className="text-sm text-gray-200 leading-relaxed">
      {displayedText}
      {isStreaming && (
        <motion.span
          className="inline-block w-2 h-4 ml-1 bg-purple-400"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      )}
    </div>
  </div>
</div>
```

### 3.9 Sidebar

```tsx
// Sidebar moderne
<aside className="
  w-[260px]
  bg-black/50
  border-r border-white/[0.05]
  backdrop-blur-xl
  flex flex-col
">
  {/* Header */}
  <div className="p-4 border-b border-white/[0.05]">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
      Navigation
    </h2>
  </div>
  
  {/* Menu items */}
  <nav className="flex-1 p-2">
    {items.map(item => (
      <button
        key={item.id}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm",
          "transition-all duration-200",
          active === item.id 
            ? "bg-white/[0.05] text-white" 
            : "text-gray-400 hover:text-white hover:bg-white/[0.03]"
        )}
      >
        <item.icon className="w-4 h-4" />
        <span>{item.label}</span>
        {item.badge && (
          <span className="ml-auto text-xs text-gray-500">
            {item.badge}
          </span>
        )}
      </button>
    ))}
  </nav>
</aside>
```

### 3.10 Panel de Statut

```tsx
// Panel de statut style terminal
<div className="
  bg-black/60
  border border-white/[0.06]
  rounded-xl
  p-4
  font-mono text-xs
">
  {/* Header */}
  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.05]">
    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
    <span className="text-gray-400">Status</span>
    <span className="text-white ml-auto">Running</span>
  </div>
  
  {/* Stats */}
  <div className="grid grid-cols-3 gap-4">
    <div>
      <div className="text-gray-500 mb-1">Phase</div>
      <div className="text-cyan-400">RECON</div>
    </div>
    <div>
      <div className="text-gray-500 mb-1">Duration</div>
      <div className="text-white">12:34</div>
    </div>
    <div>
      <div className="text-gray-500 mb-1">Findings</div>
      <div className="text-red-400">3</div>
    </div>
  </div>
</div>
```

---

## 4. Animations

### 4.1 Transitions

```css
/* Transitions globales */
* {
  transition-property: color, background-color, border-color, opacity, transform, box-shadow;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Variantes */
.transition-fast { transition-duration: 100ms; }
.transition-normal { transition-duration: 200ms; }
.transition-slow { transition-duration: 300ms; }
```

### 4.2 Micro-interactions

```css
/* Hover lift */
.hover-lift {
  transition: transform 200ms ease;
}
.hover-lift:hover {
  transform: translateY(-2px);
}

/* Press down */
.press-down:active {
  transform: scale(0.98);
}

/* Glow pulse */
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 10px var(--glow-purple); }
  50% { box-shadow: 0 0 20px var(--glow-purple); }
}

/* Cursor blink */
@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

### 4.3 Page Transitions

```tsx
// Framer Motion page transition
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

<motion.div
  variants={pageVariants}
  initial="initial"
  animate="animate"
  exit="exit"
  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
>
  {children}
</motion.div>
```

---

## 5. Structure de l'Application Electron

### 5.1 Stack Technique Recommandée

| Technologie | Usage |
|-------------|-------|
| **Electron + Vite** | Runtime desktop |
| **React 18+** | UI framework |
| **TypeScript** | Type safety |
| **Tailwind CSS 4** | Styling |
| **Framer Motion** | Animations |
| **Zustand** | State management |
| **TanStack Query** | Server state |

### 5.2 Structure des Fichiers

```
lea-electron/
├── electron/
│   ├── main.ts              # Main process
│   ├── preload.ts           # Preload scripts
│   └── ipc/
│       └── handlers.ts      # IPC handlers
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home page
│   │   └── globals.css      # Global styles
│   ├── components/
│   │   ├── ui/              # Base components (shadcn)
│   │   ├── layout/          # Layout components
│   │   ├── pentest/         # Pentest components
│   │   ├── report/          # Report components
│   │   └── providers/       # Provider components
│   ├── hooks/
│   ├── store/
│   ├── lib/
│   └── types/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

### 5.3 Configuration Electron-Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'electron-vite/plugin';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
});
```

---

## 6. Responsive Design

### 6.1 Breakpoints

```css
/* Breakpoints */
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

### 6.2 Layout Adaptatif

| Breakpoint | Layout |
|------------|--------|
| < 768px | Single column, sidebar cachée |
| 768px - 1024px | Two columns, sidebar collapsible |
| > 1024px | Three columns, sidebar visible |

---

## 7. Accessibilité

### 7.1 Contraste

- Texte sur fond sombre : contraste minimum 4.5:1
- Texte large : contraste minimum 3:1
- Accent colors : vérifier avec outil de contraste

### 7.2 Focus States

```css
/* Focus visible */
:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}

/* Focus ring */
.focus-ring:focus {
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3);
}
```

### 7.3 Motion Reduction

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Références Visuelles

### 8.1 Inspirations zcode

| Élément | Inspiration |
|---------|-------------|
| Header | Barre minimaliste, logo discret |
| Sidebar | Navigation épurée, icônes subtiles |
| Cartes | Coins arrondis, bordures subtiles |
| Interactions | Hover effects, transitions fluides |

### 8.2 Inspirations Claude Code

| Élément | Inspiration |
|---------|-------------|
| Chat | Messages bubbles, streaming cursor |
| Terminal | Output style, syntax highlighting |
| Status | Indicateurs temps réel, progress |

### 8.3 Inspirations Cursor

| Élément | Inspiration |
|---------|-------------|
| Tabs | Onglets modernes, indicateurs actifs |
| Panels | Panels redimensionnables |
| Theme | Dark theme cohérent |

---

## 9. Checklist Implementation

### 9.1 Base
- [ ] Setup Electron + Vite
- [ ] Configurer Tailwind CSS 4
- [ ] Implémenter les design tokens
- [ ] Créer les composants de base

### 9.2 Layout
- [ ] Header avec navigation
- [ ] Sidebar gauche (collapsible)
- [ ] Zone de contenu principale
- [ ] Panel droit (optionnel)

### 9.3 Composants
- [ ] Boutons (primary, secondary, ghost)
- [ ] Inputs (text, textarea, select)
- [ ] Cards et panels
- [ ] Badges et tags
- [ ] Modales et dialogs
- [ ] Toasts et notifications

### 9.4 Features
- [ ] Streaming messages avec curseur
- [ ] Avatars ASCII avec glow
- [ ] Transitions de page
- [ ] Animations de hover
- [ ] Mode reduced motion

---

**Fin du guide UI/UX — Inspiration zcode & AI IDEs**
