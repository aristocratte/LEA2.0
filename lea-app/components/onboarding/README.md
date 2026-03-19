# Quick Start avec Templates - Documentation

## Vue d'ensemble

Cette implémentation fournit une expérience d'onboarding complète avec deux modes de création de pentest:
- **Quick Start**: Configuration rapide avec templates préconfigurés
- **Advanced**: Configuration complète avec contrôle total

## Composants créés

### 1. WelcomeScreen.tsx

Le composant principal qui orchestre l'écran d'accueil.

**Fonctionnalités:**
- Titre "Commencez votre scan de sécurité" avec icône Shield
- 2 cartes cliquables pour sélectionner le mode (Quick Start / Advanced)
- Animation hover sur les cartes avec bordure orange
- Affichage conditionnel de la grille de templates (mode Quick Start uniquement)
- Bouton "Continuer" avec états disabled/enabled
- Texte d'aide contextuel

**Props:**
```typescript
interface WelcomeScreenProps {
  onStart: (mode: StartMode, template?: PentestTemplate) => void;
}

type StartMode = 'quick' | 'advanced' | null;
```

**Usage:**
```tsx
import { WelcomeScreen } from '@/components/onboarding';

function MyPage() {
  const handleStart = (mode, template) => {
    if (mode === 'quick' && template) {
      // Appliquer le template et naviguer
    } else if (mode === 'advanced') {
      // Naviguer vers la configuration avancée
    }
  };

  return <WelcomeScreen onStart={handleStart} />;
}
```

### 2. TemplateGrid.tsx (Existant, mis à jour)

Grille de templates prédéfinis affichés en 2 colonnes sur mobile, 4 sur desktop.

**Templates disponibles:**
1. **Web Application Security** - OWASP Top 10, analyse complète (25-45 min, $0.15)
2. **API Security Assessment** - REST/GraphQL focus (30-50 min, $0.18)
3. **Network Reconnaissance** - Port scan, service detection (10-25 min, $0.05)
4. **Comprehensive Audit** - Full coverage, deep analysis (45-90 min, $0.45)

**Props:**
```typescript
interface TemplateGridProps {
  selectedId: string | null;
  onSelect: (template: PentestTemplate) => void;
}
```

### 3. TemplateCard.tsx (Existant)

Carte individuelle de template avec:
- Icône colorée
- Nom et description
- Tags (OWASP, Web, API, etc.)
- Durée estimée et coût
- Animation hover avec bordure orange
- Badge de sélection (checkmark orange)

### 4. index.ts

Fichier d'export centralisé pour faciliter les imports:
```typescript
export { WelcomeScreen } from './WelcomeScreen';
export { TemplateGrid } from './TemplateGrid';
export { TemplateCard } from './TemplateCard';
export { DraftRecoveryBanner } from './DraftRecoveryBanner';
export { WelcomeCard } from './WelcomeCard';
```

## Design

```
┌─────────────────────────────────────────┐
│         🔒 (Icône Shield)               │
│                                         │
│   Commencez votre scan de sécurité      │
│   Choisissez comment configurer         │
│                                         │
│  ┌──────────────┐  ┌──────────────┐    │
│  │  ⚡ Quick    │  │  ⚙️ Advanced │    │
│  │  Start       │  │              │    │
│  │              │  │              │    │
│  │  30 secondes │  │  Complet     │    │
│  │  Templates   │  │  Config      │    │
│  │  préconfig.  │  │  détaillée   │    │
│  └──────────────┘  └──────────────┘    │
│                                         │
│  ─────── Choose a template ───────      │
│                                         │
│  [Web App] [API] [Network] [Full]      │
│                                         │
│         [Lancer le scan →]              │
│                                         │
│   Texte d'aide contextuel               │
└─────────────────────────────────────────┘
```

## Intégration avec le Store Zustand

Le store `pentest-creation-store` contient déjà les templates et la logique:

```typescript
// Appliquer un template
const { applyTemplate, setCurrentStep } = usePentestCreationStore();

const handleStart = (mode: StartMode, template?: PentestTemplate) => {
  if (mode === 'quick' && template) {
    applyTemplate(template); // Configure scanType, thinkingBudget, etc.
  }
  setCurrentStep(1);
  router.push('/pentest/new/scope');
};
```

## Personnalisation des Templates

Les templates sont définis dans `/store/pentest-creation-store.ts`:

```typescript
export const PENTEST_TEMPLATES: PentestTemplate[] = [
  {
    id: 'web-app',
    name: 'Web Application Security',
    description: '...',
    icon: '🌐',
    scanType: 'standard',
    thinkingBudget: 'standard',
    estimatedMinutes: [25, 45],
    estimatedCostCents: 15,
    defaultInScope: [],
    tags: ['OWASP', 'Web'],
  },
  // ... autres templates
];
```

Pour ajouter un nouveau template:
1. Ajouter un objet à `PENTEST_TEMPLATES`
2. Définir `scanType` et `thinkingBudget`
3. Spécifier la durée et le coût estimés
4. Ajouter des tags descriptifs

## Animations

Tous les composants utilisent Framer Motion:
- Animations d'entrée/sortie avec `AnimatePresence`
- Hover states avec `whileHover` et `whileTap`
- Transitions fluides entre états
- Stagger effect pour la grille de templates

## Responsive Design

- **Mobile (< 640px)**: 2 colonnes pour les templates
- **Desktop (≥ 640px)**: 4 colonnes pour les templates
- Les cartes de mode s'adaptent à la largeur disponible
- Padding et espacement optimisés pour chaque taille d'écran

## Accessibilité

- Boutons avec `type="button"` pour éviter la soumission de formulaire
- Labels et descriptions clairs
- Contraste de couleurs conforme WCAG
- Navigation au clavier supportée
- Indicateurs visuels de sélection

## Tests

Pour tester le composant:
1. Sélectionner Quick Start → les templates doivent apparaître
2. Sélectionner Advanced → pas de templates, bouton "Configurer"
3. Sélectionner un template → badge orange apparaît
4. Cliquer sur Continuer → `onStart` est appelé avec les bons paramètres

## Fichiers créés/modifiés

- ✅ `/components/onboarding/WelcomeScreen.tsx` - Nouveau composant principal
- ✅ `/components/onboarding/TemplateGrid.tsx` - Déjà existant
- ✅ `/components/onboarding/TemplateCard.tsx` - Déjà existant
- ✅ `/components/onboarding/index.ts` - Exports centralisés
- ✅ `/components/onboarding/ExampleUsage.tsx` - Exemple d'utilisation

## Critères de succès

- [x] 2 modes cliquables (Quick Start / Advanced)
- [x] 4 templates affichés dans une grille responsive
- [x] Quick Start crée un pentest avec les defaults du template
- [x] Animation hover sur les cartes avec bordure orange
- [x] Navigation vers étape suivante via callback `onStart`
- [x] Texte d'aide contextuel
- [x] Bouton "Continuer" avec états disabled/enabled appropriés
