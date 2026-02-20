# Analyse Fonctionnelle — Onglet Providers LEA/EASM AI Platform

> **Version** : 1.0.0
> **Date** : Février 2025
> **Portée** : Analyse fonctionnelle exhaustive de l'onglet Providers

---

## 1. Vue d'Ensemble

L'onglet Providers permet de configurer et gérer les différents fournisseurs d'IA (LLM) utilisés par la plateforme. Il constitue le point de configuration central pour les API keys, les modèles disponibles et les paramètres de chaque provider.

### 1.1 État Actuel

| Aspect | Statut | Commentaire |
|--------|--------|-------------|
| Spécifications | ✅ Partielles | Configuration basique définie |
| Implémentation Frontend | ❌ Non démarrée | Scaffold uniquement |
| Implémentation Backend | ❌ Non démarrée | Endpoints non créés |
| Sécurité | 📋 Critique | Gestion des API keys à sécuriser |

---

## 2. Architecture Fonctionnelle

### 2.1 Flux Principal

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW PROVIDERS                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐   │
│  │  LIST    │───▶│  CONFIG   │───▶│   TEST    │───▶│  SAVE    │   │
│  │ Providers│    │  Provider │    │ Connection│    │  Config  │   │
│  └──────────┘    └───────────┘    └───────────┘    └──────────┘   │
│       │               │                 │                │         │
│       ▼               ▼                 ▼                ▼         │
│  [Sélection       [Saisie API key   [Validation]    [Persistence   │
│   provider]        et paramètres]                    sécurisée]   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Providers Supportés

| Provider | Type | Models | Usage Principal |
|----------|------|--------|-----------------|
| **Anthropic** | Cloud | Claude 4, Claude 3.5 | Agent principal, raisonnement avancé |
| **Zhipu AI** | Cloud | GLM-4, GLM-5 | Agent secondaire, backup |
| **OpenAI** | Cloud | GPT-4, GPT-4o | Alternatif |
| **Custom** | On-premise | Any | Déploiement privé |

---

## 3. Fonctionnalités Détaillées

### 3.1 Liste des Providers (ProviderList)

#### 3.1.1 Affichage Principal

**Fonction** : Présenter tous les providers configurés et disponibles.

**Informations affichées par provider** :

| Information | Description |
|-------------|-------------|
| Nom | Anthropic, Zhipu AI, OpenAI, Custom |
| Statut | Configuré / Non configuré |
| Modèles | Nombre de modèles disponibles |
| Défaut | Provider par défaut ou non |
| Santé | Dernier test de connexion |
| Usage | Consommation estimée |

#### 3.1.2 Indicateurs de Statut

| Statut | Visuel | Description |
|--------|--------|-------------|
| Configuré | ✅ Vert | API key valide, prêt à l'usage |
| Non configuré | ⚪ Gris | Pas d'API key configurée |
| Erreur | 🔴 Rouge | Dernière connexion échouée |
| Warning | 🟡 Orange | Quota faible ou dépréciation |

#### 3.1.3 Actions Rapides

| Action | Description |
|--------|-------------|
| Configurer | Ouvrir le formulaire de configuration |
| Tester | Valider la connexion |
| Définir par défaut | Définir comme provider principal |
| Supprimer | Supprimer la configuration |

### 3.2 Configuration d'un Provider (ProviderConfig)

#### 3.2.1 Informations de Base

**Champs communs** :

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom d'affichage |
| `type` | enum | Type de provider |
| `is_default` | boolean | Provider par défaut |
| `priority` | number | Ordre de priorité (fallback) |

#### 3.2.2 Configuration API

**Pour providers cloud** :

| Champ | Type | Description |
|-------|------|-------------|
| `api_key` | string | Clé API (chiffrée en DB) |
| `base_url` | string | URL de base (optionnel) |
| `organization_id` | string | ID d'organisation (optionnel) |

**Pour providers custom** :

| Champ | Type | Description |
|-------|------|-------------|
| `endpoint_url` | string | URL de l'API |
| `api_key` | string | Clé API (optionnel) |
| `auth_header` | string | Header d'authentification |
| `request_format` | string | Format de requête (OpenAI compatible, etc.) |

#### 3.2.3 Sélection des Modèles

**Fonction** : Choisir les modèles disponibles pour chaque provider.

**Modèles Anthropic** :
| Modèle | Usage | Contexte | Prix |
|--------|-------|----------|------|
| Claude Opus 4 | Raisonnement complexe | 200K tokens | $$$ |
| Claude Sonnet 4 | Usage général | 200K tokens | $$ |
| Claude Haiku 3.5 | Tâches rapides | 200K tokens | $ |

**Modèles Zhipu AI** :
| Modèle | Usage | Contexte | Prix |
|--------|-------|----------|------|
| GLM-5 | Usage général | 128K tokens | $$ |
| GLM-4-Plus | Raisonnement | 128K tokens | $$$ |
| GLM-4-Flash | Tâches rapides | 128K tokens | $ |

#### 3.2.4 Paramètres Avancés

**Paramètres par modèle** :

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `temperature` | float | 0.7 | Créativité (0-1) |
| `max_tokens` | int | 4096 | Tokens max par réponse |
| `top_p` | float | 0.9 | Nucleus sampling |
| `timeout` | int | 60000 | Timeout en ms |
| `retry_count` | int | 3 | Tentatives en cas d'erreur |

### 3.3 Test de Connexion (ProviderTest)

#### 3.3.1 Objectif

Valider que la configuration du provider est correcte et que l'API est accessible.

#### 3.3.2 Processus de Test

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TEST DE CONNEXION                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Validation du format de l'API key                               │
│     └─► Format correct ? → Continuer                                │
│                        → Erreur: Format invalide                     │
│                                                                     │
│  2. Test de connectivité                                             │
│     └─► Ping l'endpoint API                                         │
│     └─► Timeout ? → Erreur: Impossible de joindre l'API             │
│                                                                     │
│  3. Test d'authentification                                          │
│     └─► Requête models list                                         │
│     └─► 401/403 ? → Erreur: Authentification échouée                │
│                                                                     │
│  4. Test de génération                                               │
│     └─► Prompt simple: "Hello"                                      │
│     └─► Réponse reçue ? → Succès                                    │
│                         → Erreur: Pas de réponse                     │
│                                                                     │
│  5. Validation des modèles                                           │
│     └─► Vérifier que les modèles sélectionnés sont disponibles      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.3.3 Résultats du Test

**Succès** :
```
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ Connexion réussie                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Provider: Anthropic                                                  │
│ Latence: 245ms                                                       │
│ Modèles disponibles: 3/3                                             │
│ Quota restant: 95%                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Échec** :
```
┌─────────────────────────────────────────────────────────────────────┐
│ ❌ Connexion échouée                                                 │
├─────────────────────────────────────────────────────────────────────┤
│ Erreur: API key invalide                                             │
│ Code: 401 Unauthorized                                               │
│                                                                      │
│ Suggestions:                                                         │
│ - Vérifiez que l'API key est correcte                               │
│ - Vérifiez que l'API key n'a pas expiré                             │
│ - Vérifiez les permissions du compte                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Gestion des API Keys

#### 3.4.1 Sécurité

**Problème critique** :

> ⚠️ **PROVIDER-001** : Les API keys doivent être chiffrées en base de données.

**Exigences de sécurité** :
- Chiffrement AES-256 en base de données
- Masquage dans l'interface (****...****)
- Rotation des clés de chiffrement
- Audit des accès aux clés
- Support de variables d'environnement

#### 3.4.2 Stockage

**Format en base de données** :
```typescript
interface StoredApiKey {
  id: string;
  provider_id: string;
  encrypted_key: string;     // AES-256-GCM encrypted
  key_hash: string;          // SHA-256 pour vérification
  iv: string;                // Initialization vector
  auth_tag: string;          // Authentication tag
  created_at: Date;
  last_used_at?: Date;
  expires_at?: Date;
}
```

#### 3.4.3 Masquage UI

**Affichage** :
- API key: `sk-ant-****...****abcd`

**Actions** :
- [ ] Copier (temporairement visible)
- [ ] Régénérer
- [ ] Révoquer

### 3.5 Gestion des Quotas

#### 3.5.1 Suivi de Consommation

**Métriques trackées** :

| Métrique | Description |
|----------|-------------|
| `tokens_used` | Tokens consommés (input + output) |
| `requests_count` | Nombre de requêtes |
| `cost_estimate` | Coût estimé en USD |
| `rate_limit_remaining` | Requêtes restantes dans la fenêtre |

#### 3.5.2 Alertes

**Seuils configurables** :
- Warning à 80% du quota
- Alerte à 95% du quota
- Blocage à 100% du quota

### 3.6 Fallback et Priorité

#### 3.6.1 Système de Fallback

**Fonction** : Basculer automatiquement vers un provider secondaire en cas de défaillance.

**Ordre de priorité** :
```
1. Anthropic (default)
     ↓ en cas d'erreur
2. Zhipu AI (backup)
     ↓ en cas d'erreur
3. OpenAI (tertiary)
     ↓ en cas d'erreur
4. Erreur: Aucun provider disponible
```

#### 3.6.2 Conditions de Fallback

| Condition | Action |
|-----------|--------|
| Erreur 429 (Rate Limit) | Fallback vers le suivant |
| Erreur 5xx (Server) | Retry 3x puis fallback |
| Timeout | Retry 2x puis fallback |
| Erreur 401 (Auth) | Pas de fallback, erreur critique |

---

## 4. Modèle de Données

### 4.1 Entité Provider

```typescript
interface Provider {
  id: string;
  
  // Identification
  name: string;
  type: 'anthropic' | 'zhipu' | 'openai' | 'custom';
  display_name: string;
  
  // Configuration
  api_key_encrypted?: string;
  base_url?: string;
  organization_id?: string;
  
  // Paramètres
  is_default: boolean;
  priority: number;
  enabled: boolean;
  
  // Modèles disponibles
  models: ModelConfig[];
  
  // Paramètres globaux
  default_temperature: number;
  default_max_tokens: number;
  timeout_ms: number;
  retry_count: number;
  
  // Métadonnées
  created_at: Date;
  updated_at: Date;
  last_used_at?: Date;
  last_error?: string;
  
  // Santé
  health_status: 'healthy' | 'degraded' | 'unhealthy';
  last_health_check?: Date;
}
```

### 4.2 Entité ModelConfig

```typescript
interface ModelConfig {
  id: string;
  provider_id: string;
  
  // Identification
  model_id: string;          // ex: "claude-sonnet-4"
  display_name: string;      // ex: "Claude Sonnet 4"
  
  // Paramètres
  context_window: number;    // tokens
  max_output_tokens: number;
  supports_streaming: boolean;
  supports_vision: boolean;
  supports_tools: boolean;
  
  // Pricing (USD per 1K tokens)
  input_price_per_1k: number;
  output_price_per_1k: number;
  
  // Usage
  enabled: boolean;
  usage_count: number;
  last_used_at?: Date;
}
```

---

## 5. Points d'API Requis

### 5.1 Endpoints REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/providers` | Liste des providers |
| POST | `/api/providers` | Ajouter un provider |
| GET | `/api/providers/:id` | Détails d'un provider |
| PUT | `/api/providers/:id` | Modifier un provider |
| DELETE | `/api/providers/:id` | Supprimer un provider |
| POST | `/api/providers/:id/test` | Tester la connexion |
| PATCH | `/api/providers/:id/default` | Définir par défaut |
| GET | `/api/providers/:id/models` | Modèles disponibles |
| GET | `/api/providers/:id/usage` | Statistiques d'usage |

### 5.2 Endpoints Sécurisés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/providers/:id/api-key` | Définir l'API key |
| DELETE | `/api/providers/:id/api-key` | Révoquer l'API key |
| GET | `/api/providers/:id/api-key/masked` | API key masquée |

---

## 6. Intégration avec l'Agent

### 6.1 Sélection du Provider

**Dans l'orchestrateur** :

```typescript
class ProviderManager {
  /**
   * Sélectionne le meilleur provider pour une tâche donnée
   */
  selectProvider(task: Task): Provider {
    // 1. Vérifier le provider par défaut
    const defaultProvider = this.getDefaultProvider();
    if (this.isHealthy(defaultProvider)) {
      return defaultProvider;
    }
    
    // 2. Fallback vers les providers secondaires
    for (const provider of this.getProvidersByPriority()) {
      if (this.isHealthy(provider)) {
        return provider;
      }
    }
    
    throw new Error('No healthy provider available');
  }
  
  /**
   * Vérifie la santé d'un provider
   */
  isHealthy(provider: Provider): boolean {
    return provider.health_status === 'healthy' || 
           provider.health_status === 'degraded';
  }
}
```

### 6.2 Mapping Agent → Provider

**Règles de sélection** :

| Type d'Agent | Provider Recommandé | Modèle |
|--------------|---------------------|--------|
| Coordinator | Anthropic | Claude Sonnet 4 |
| Recon | Zhipu AI | GLM-4-Flash |
| Scanner | Zhipu AI | GLM-4-Flash |
| Exploiter | Anthropic | Claude Sonnet 4 |
| Analyzer | Anthropic | Claude Opus 4 |
| Reporter | Zhipu AI | GLM-4 |

---

## 7. Problèmes Critiques

### 7.1 Sécurité des API Keys

> ⚠️ **PROVIDER-001** : Les API keys doivent être chiffrées en base de données.

**Solution** :
- Utiliser AES-256-GCM pour le chiffrement
- Stocker IV et auth tag séparément
- Rotation des clés de chiffrement
- Audit logging

### 7.2 Gestion des Erreurs

> ⚠️ **PROVIDER-002** : Pas de gestion d'erreur robuste en cas de défaillance provider.

**Solution** :
- Implémenter le système de fallback
- Retry avec exponential backoff
- Circuit breaker pattern
- Alertes automatiques

### 7.3 Audit Trail

> ⚠️ **PROVIDER-003** : Pas de traçabilité des accès aux API keys.

**Solution** :
- Logger tous les accès aux clés
- Horodatage et utilisateur
- Conservation des logs 90 jours
- Alertes sur accès suspects

---

## 8. Références et Inspirations

### 8.1 Patterns de Sécurité

| Pattern | Description |
|---------|-------------|
| Vault | Stockage sécurisé type HashiCorp Vault |
| KMS | Key Management Service cloud |
| HSM | Hardware Security Module |
| Environment Variables | Injection via variables d'environnement |

### 8.2 Gestion des Quotas

| Provider | API de Quota |
|----------|--------------|
| Anthropic | Headers X-RateLimit-* |
| OpenAI | Headers X-RateLimit-* |
| Zhipu AI | API dédiée |

---

## 9. Roadmap d'Implémentation

### Phase 1 : MVP (3 jours)
- [ ] Liste des providers
- [ ] Configuration basique (API key)
- [ ] Test de connexion simple
- [ ] Stockage chiffré

### Phase 2 : Avancé (1 semaine)
- [ ] Sélection des modèles
- [ ] Paramètres avancés
- [ ] Système de fallback
- [ ] Gestion des quotas

### Phase 3 : Entreprise (2 semaines)
- [ ] Audit trail complet
- [ ] Rotation des clés
- [ ] Multi-tenancy
- [ ] SSO integration

---

**Fin de l'analyse fonctionnelle — Onglet Providers**
