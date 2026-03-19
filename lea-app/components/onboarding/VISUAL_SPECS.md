# WelcomeScreen - Spécifications Visuelles

## Layout Principal

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                        🔒 (Icône Shield)                        │
│                   Fond: Dégradé orange #F5A623                  │
│                   Taille: 56x56px, border-radius: 16px          │
│                                                                 │
│           Commencez votre scan de sécurité                      │
│           Taille: 24px, font-weight: bold, zinc-900             │
│                                                                 │
│     Choisissez comment vous souhaitez configurer votre pentest  │
│           Taille: 14px, zinc-500                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Cartes de Mode

### État Initial (Non sélectionné)

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  ⚡ (Fond: zinc-100)     │     │  ⚙️ (Fond: zinc-100)     │
│                          │     │                          │
│  Quick Start             │     │  Advanced                │
│  (14px, bold, zinc-900)  │     │  (14px, bold, zinc-900)  │
│                          │     │                          │
│  Configuration rapide    │     │  Configuration complète  │
│  avec templates          │     │  avec contrôle total     │
│  (13px, zinc-500)        │     │  (13px, zinc-500)        │
│                          │     │                          │
│  ────────────────────    │     │  ────────────────────    │
│                          │     │                          │
│  • Templates préconfigurés│     │  • Configuration détaillée│
│  • Paramètres optimaux   │     │  • Choix du modèle       │
│  • Idéal pour débuter    │     │  • Pour experts          │
│                          │     │                          │
└──────────────────────────┘     └──────────────────────────┘
  Border: zinc-200                  Border: zinc-200
  Background: white                 Background: white
  Padding: 24px                     Padding: 24px
  Border-radius: 12px               Border-radius: 12px
```

### État Sélectionné

```
┌──────────────────────────┐
│  ⚡ (Fond: #F5A623)  ✓   │  <- Badge orange en haut à droite
│      (Icône blanche)     │     avec checkmark blanc
│                          │
│  Quick Start             │
│  (14px, bold, zinc-900)  │
│                          │
│  ...                     │
│                          │
└──────────────────────────┘
  Border: 2px solid #F5A623
  Background: orange-50/40 (très léger)
  Box-shadow: medium
```

### État Hover

```
┌──────────────────────────┐
│  ⚡ (Fond: zinc-100)     │
│                          │
│  Quick Start             │
│                          │
└──────────────────────────┘
  Border: zinc-300
  Box-shadow: small
  Transform: scale(1.01)
  Transition: all 0.2s ease-out
```

## Grille de Templates

### Layout

```
───────────── Choose a template ─────────────
(Texte: 12px, bold, uppercase, tracking-widest, zinc-400)

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Web App   │ │     API     │ │   Network   │ │    Full     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
   Grid: 2 columns on mobile (< 640px)
         4 columns on desktop (≥ 640px)
         Gap: 12px
```

### Template Card (Non sélectionné)

```
┌──────────────────────────┐
│  🌐                      │  <- Icône: 32x32px, fond zinc-100
│                          │     border-radius: 8px
│  Web Application         │  <- 13px, bold, zinc-900
│  Security                │
│                          │
│  Comprehensive OWASP-    │  <- 12px, zinc-500, leading-snug
│  based assessment of     │
│  web vulnerabilities     │
│                          │
│  [OWASP] [Web]           │  <- Tags: 10px, fond zinc-100
│                          │     border-radius: 4px
│  ─────────────────────   │
│  🕐 25–45 min · $0.15    │  <- 11px, zinc-400
└──────────────────────────┘
  Border: zinc-200
  Background: white
  Padding: 16px
  Border-radius: 12px
  Cursor: pointer
```

### Template Card (Sélectionné)

```
                    ✓  <- Badge orange 20x20px
┌──────────────────────────┐
│  🌐                      │     avec checkmark blanc
│                          │
│  Web Application         │
│  Security                │
│                          │
│  ...                     │
└──────────────────────────┘
  Border: 2px solid #F5A623
  Background: orange-50/40
```

## Bouton Continuer

### État Disabled

```
┌────────────────────────────┐
│   Lancer le scan →         │
└────────────────────────────┘
  Background: zinc-100
  Color: zinc-400
  Min-width: 200px
  Height: 44px
  Font-size: 16px
  Font-weight: 600
  Border-radius: 8px
  Cursor: not-allowed
```

### État Enabled (Quick Start)

```
┌────────────────────────────┐
│   Lancer le scan →         │
└────────────────────────────┘
  Background: #F5A623
  Hover: #E8940F
  Color: white
  Min-width: 200px
  Height: 44px
  Font-size: 16px
  Font-weight: 600
  Border-radius: 8px
  Box-shadow: medium
  Transition: all 0.15s
```

### État Enabled (Advanced)

```
┌────────────────────────────┐
│   Configurer le scan →     │  <- Texte différent
└────────────────────────────┘
  (Même style que Quick Start)
```

## Texte d'Aide

```
┌────────────────────────────────────────────────────┐
│  Sélectionnez un mode pour commencer               │
│  (ou autre texte contextuel selon l'état)          │
│  Taille: 12px, zinc-400, text-center               │
└────────────────────────────────────────────────────┘
```

## Animations

### Entrée du Composant

```typescript
// Container
variants: {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

// Items individuels
variants: {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 }
}
transition: { duration: 0.2, ease: 'easeOut' }
```

### Hover sur les Cartes

```typescript
whileHover: { scale: 1.01 }
whileTap: { scale: 0.99 }
transition: { duration: 0.15, ease: 'easeOut' }
```

### Apparition de la Grille de Templates

```typescript
initial: { opacity: 0, height: 0 }
animate: { opacity: 1, height: 'auto' }
exit: { opacity: 0, height: 0 }
transition: { duration: 0.3, ease: 'easeOut' }
```

### Badge de Sélection

```typescript
initial: { scale: 0.6, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: { duration: 0.15, ease: 'easeOut' }
```

## Responsive Breakpoints

```css
/* Mobile (< 640px) */
.template-grid {
  grid-template-columns: repeat(2, 1fr);
}

/* Desktop (≥ 640px) */
.template-grid {
  grid-template-columns: repeat(4, 1fr);
}

/* Container max-width */
.welcome-container {
  max-width: 768px; /* max-w-3xl */
  margin: 0 auto;
}
```

## Couleurs Utilisées

```css
/* Primary Brand */
--orange-primary: #F5A623;
--orange-hover: #E8940F;
--orange-light: #FFF7ED;     /* orange-50 */
--orange-lighter: #FFEDD5;   /* orange-100 */

/* Text */
--text-primary: #18181B;     /* zinc-900 */
--text-secondary: #71717A;   /* zinc-500 */
--text-tertiary: #A1A1AA;    /* zinc-400 */
--text-disabled: #D4D4D8;    /* zinc-300 */

/* Borders */
--border-default: #E4E4E7;   /* zinc-200 */
--border-hover: #D4D4D8;     /* zinc-300 */

/* Backgrounds */
--bg-primary: #FFFFFF;
--bg-secondary: #FAFAFA;     /* zinc-50 */
--bg-card: #F4F4F5;          /* zinc-100 */
```

## Espacements

```css
/* Padding */
--padding-card: 24px;        /* p-6 */
--padding-template: 16px;    /* p-4 */

/* Margins */
--margin-title: 32px;        /* mb-8 */
--margin-cards: 24px;        /* mb-6 */
--margin-button: 16px;       /* mt-4 */

/* Gaps */
--gap-cards: 16px;           /* gap-4 */
--gap-templates: 12px;       /* gap-3 */
--gap-content: 8px;          /* gap-2 */
```

## Accessibilité

- **Focus visible**: Bordure orange avec ring
- **Contraste**: Minimum 4.5:1 pour le texte
- **Touch targets**: Minimum 44x44px
- **Keyboard navigation**: Tab, Enter, Space supportés
- **Screen readers**: Labels descriptifs pour les boutons
