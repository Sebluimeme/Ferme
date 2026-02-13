# Suivi-GO — Documentation technique complète

## Vue d'ensemble

Application web de **gestion de ferme** (cheptel, traitements, coûts, profits) construite avec Next.js et Firebase Realtime Database. L'application est une migration d'une SPA vanilla JS/CSS vers une stack moderne React.

**Objectif :** Permettre à un éleveur de gérer son cheptel (ovins, bovins, caprins, porcins), suivre les traitements vétérinaires, gérer les coûts et calculer les profits, le tout synchronisé en temps réel via Firebase.

---

## Stack technique

| Technologie | Version | Rôle |
|---|---|---|
| **Next.js** | 16.1.6 | Framework React (App Router) |
| **React** | 19.2.4 | UI library |
| **TypeScript** | 5.9.3 | Typage statique |
| **Tailwind CSS** | 4.1.18 | Styling utility-first |
| **Firebase** | 12.9.0 | Backend (Realtime Database) |
| **PostCSS** | 8.5.6 | Processing CSS |

---

## Structure du projet

```
src/
├── app/                          # Pages (Next.js App Router)
│   ├── layout.tsx                # Layout racine (navbar + sidebar + providers)
│   ├── page.tsx                  # Dashboard (page d'accueil)
│   ├── globals.css               # Styles globaux + thème Tailwind custom
│   ├── animaux/
│   │   └── page.tsx              # CRUD complet des animaux
│   ├── traitements/
│   │   └── page.tsx              # Placeholder
│   ├── couts/
│   │   └── page.tsx              # Placeholder
│   ├── profits/
│   │   └── page.tsx              # Placeholder
│   ├── rapports/
│   │   └── page.tsx              # Placeholder
│   └── materiel/
│       └── page.tsx              # Placeholder (Phase 2)
│
├── components/                   # Composants React réutilisables
│   ├── Navbar.tsx                # Barre de navigation supérieure
│   ├── Sidebar.tsx               # Menu latéral de navigation
│   ├── Modal.tsx                 # Modal générique + ConfirmModal
│   ├── Toast.tsx                 # Système de notifications (Context + Provider)
│   ├── KpiCard.tsx               # Carte indicateur KPI
│   ├── AnimalCard.tsx            # Carte affichant un animal
│   ├── AnimalForm.tsx            # Formulaire ajout/édition animal
│   └── PlaceholderPage.tsx       # Page placeholder modules non développés
│
├── lib/                          # Librairies et utilitaires
│   ├── firebase.ts               # Configuration et initialisation Firebase
│   ├── firebase-service.ts       # Service CRUD générique Firebase
│   └── utils.ts                  # Fonctions utilitaires (formatage, helpers)
│
├── services/                     # Logique métier
│   └── animal-service.ts         # Service animaux (validation, CRUD, recherche, stats)
│
└── store/                        # State management
    └── store.tsx                 # React Context + useReducer (état global)
```

---

## Architecture et patterns

### State Management
L'application utilise **React Context + useReducer** (pas de librairie externe type Zustand/Redux).

- **`AppProvider`** wrape toute l'application dans `layout.tsx`
- **`useAppStore()`** hook pour accéder à l'état et au dispatch
- Au montage, 5 listeners Firebase temps réel sont créés pour : `animaux`, `traitements`, `couts`, `ventes`, `alertes`
- Les listeners sont nettoyés au démontage

### Flux de données
```
Firebase Realtime DB
       ↓ (listeners onValue)
   AppProvider (store.tsx)
       ↓ (React Context)
   Composants (useAppStore())
       ↓ (actions utilisateur)
   Services (animal-service.ts)
       ↓ (appels CRUD)
   firebase-service.ts
       ↓
Firebase Realtime DB
```

### Notifications
Système de toast basé sur **React Context** (`ToastProvider` + `useToast()`). Les toasts se ferment automatiquement après 4 secondes.

---

## Modèles de données

### Animal
```typescript
interface Animal {
  id: string;                                          // ID Firebase auto-généré
  numeroBoucle: string;                                // Numéro d'identification (unique)
  nom?: string;                                        // Nom optionnel
  type: "ovin" | "bovin" | "caprin" | "porcin";       // Type d'animal
  sexe: "M" | "F";                                    // Sexe
  race?: string;                                       // Race (Suffolk, Charolaise, etc.)
  dateNaissance?: string;                              // Date ISO
  ageMois?: number;                                    // Âge calculé en mois
  poids?: number;                                      // Poids en kg
  statut: "actif" | "vendu" | "mort" | "reforme";     // Statut actuel
  commentaire?: string;                                // Notes libres
  dateCreation?: string;                               // Timestamp création
  derniereMAJ?: string;                                // Timestamp dernière modification
}
```

### Alerte
```typescript
interface Alerte {
  id: string;
  titre: string;
  description: string;
  priorite: "haute" | "moyenne" | "basse";
  statut: "active" | "resolue";
}
```

### Stats (calculées côté client)
```typescript
interface Stats {
  totalAnimaux: number;    // Nombre total
  ovins: number;           // Ovins actifs
  bovins: number;          // Bovins actifs
  caprins: number;         // Caprins actifs
  porcins: number;         // Porcins actifs
  profitGlobal: number;    // Toujours 0 (pas encore implémenté)
}
```

### État global (AppState)
```typescript
interface AppState {
  animaux: Animal[];
  traitements: unknown[];   // Pas encore typé
  couts: unknown[];         // Pas encore typé
  ventes: unknown[];        // Pas encore typé
  alertes: Alerte[];
  stats: Stats;
  loading: boolean;
  sidebarOpen: boolean;
}
```

---

## Routes de l'application

| Route | Page | Statut | Description |
|---|---|---|---|
| `/` | Dashboard | **Fonctionnel** | KPI cards, alertes, message de bienvenue |
| `/animaux` | Mes Animaux | **Fonctionnel** | CRUD complet, recherche, filtres, modales |
| `/traitements` | Traitements | **Placeholder** | Module vétérinaire à développer |
| `/couts` | Coûts | **Placeholder** | Gestion des dépenses à développer |
| `/profits` | Profits | **Placeholder** | Calcul des bénéfices à développer |
| `/rapports` | Rapports | **Placeholder** | Statistiques/exports à développer |
| `/materiel` | Matériel | **Placeholder** | Gestion équipement (Phase 2) |

---

## Fonctionnalités développées en détail

### 1. Dashboard (`/`)
- 6 cartes KPI : total animaux, ovins, bovins, caprins, porcins, profit global
- Section alertes (affiche les 5 premières alertes actives, codées par couleur selon priorité)
- Message de bienvenue avec liste des fonctionnalités

### 2. Gestion des animaux (`/animaux`)
- **Affichage** : grille responsive de cartes animaux (1 col mobile, 2 tablette, 3 desktop)
- **Ajout** : modal avec formulaire complet (type, boucle, nom, sexe, race, date naissance, poids, statut, commentaire)
- **Modification** : modal pré-rempli, numéro de boucle en lecture seule
- **Suppression** : modal de confirmation avec message de danger
- **Recherche** : filtre en temps réel par numéro de boucle, nom ou race
- **Filtrage** : par type d'animal via dropdown ou clic sur les cartes KPI
- **Validation** : numéro de boucle requis et unique, type valide, sexe requis, poids positif, date pas dans le futur
- **Calcul automatique** : l'âge en mois est recalculé à chaque sauvegarde si une date de naissance est fournie
- Seuls les animaux avec statut "actif" sont affichés dans la liste

### 3. Système de notifications (Toast)
- 4 types : success (vert), error (rouge), warning (ambre), info (bleu)
- Positionnement : haut-droite
- Auto-disparition après 4 secondes
- Fermeture manuelle possible
- Animation slide-in depuis la droite

### 4. Navigation
- **Navbar** : sticky, logo, date du jour en français, badge d'alertes
- **Sidebar** : 4 sections (Principal, Cheptel, Financier, Autres), lien actif avec gradient
- **Responsive** : sidebar cachée sur mobile, overlay + hamburger menu

### 5. Firebase Realtime Database
- Service CRUD générique avec méthodes : `create`, `getById`, `getAll`, `getWhere`, `update`, `delete`, `listen`
- Ajout automatique de métadonnées : `id`, `dateCreation`, `derniereMAJ`
- 5 listeners temps réel actifs au montage de l'application
- Configuration via variables d'environnement `NEXT_PUBLIC_FIREBASE_*`

---

## Composants UI

### Modal (`components/Modal.tsx`)
- **Modal générique** : titre, contenu libre (children), boutons optionnels, 3 tailles (small 400px, medium 600px, large 900px)
- **ConfirmModal** : modal de confirmation avec message HTML, bouton danger optionnel
- Fermeture : clic overlay, touche Escape, bouton ×
- Bloque le scroll du body quand ouvert

### KpiCard (`components/KpiCard.tsx`)
- Carte avec label, valeur grande, sous-titre optionnel
- Bordure gauche colorée configurable
- Couleur de valeur configurable
- Optionnellement cliquable

### AnimalCard (`components/AnimalCard.tsx`)
- Icône type + nom/numéro + badge type
- Grille 2x2 : sexe, race, âge, poids
- Boutons modifier et supprimer
- Bordure gauche colorée selon le type

### AnimalForm (`components/AnimalForm.tsx`)
- Formulaire non-contrôlé (utilise `ref` et `FormData`)
- 9 champs organisés en grille responsive
- Champs requis marqués avec astérisque rouge
- Numéro de boucle en readonly lors de l'édition

---

## Thème et design

### Couleurs custom (définies dans globals.css via `@theme`)
```
--color-primary: #667eea      (violet/bleu)
--color-primary-dark: #5568d3
--color-primary-light: #98a6f0
--color-secondary: #764ba2     (violet foncé)
--color-secondary-dark: #5f3c84
--color-ovin: #4CAF50          (vert)
--color-bovin: #FF9800         (orange)
--color-caprin: #9C27B0        (violet)
--color-porcin: #F44336        (rouge)
```

### Animations CSS
- `fadeIn` (0.2s) — apparition en fondu
- `slideInRight` (0.2s) — glissement depuis la droite (toasts)
- `slideInDown` (0.2s) — glissement depuis le haut (modals)

### Responsive
- **Mobile** (< 640px) : sidebar cachée, grille 1 colonne, padding réduit
- **Tablette** (640-1024px) : sidebar visible, grille 2 colonnes
- **Desktop** (> 1024px) : sidebar visible, grille 3 colonnes

---

## Fonctionnalités utilitaires (`lib/utils.ts`)

| Fonction | Description |
|---|---|
| `formatDate(str, format)` | Formate une date en français (short/long/time) |
| `formatCurrency(amount)` | Formate en EUR (ex: "1 234,50 €") |
| `formatNumber(n, decimals)` | Formate un nombre en locale française |
| `calculateAge(birthDate)` | Calcule l'âge en mois depuis une date |
| `formatAge(months)` | Convertit les mois en "X ans Y mois" |
| `getAnimalIcon(type)` | Retourne l'emoji du type (🐑🐄🐐🐷) |
| `getAnimalLabel(type)` | Retourne le nom français du type |
| `getAnimalColor(type)` | Retourne la variable CSS couleur |
| `getAnimalTailwindColor(type)` | Retourne la classe Tailwind text |
| `getAnimalBorderColor(type)` | Retourne la classe Tailwind border-l |
| `getAnimalBgColor(type)` | Retourne les classes Tailwind bg + text |

---

## Ce qui reste à développer

### Module Traitements (`/traitements`)
- Enregistrement des traitements vétérinaires
- Lien avec un animal spécifique
- Types de traitements (vaccination, vermifuge, etc.)
- Historique par animal
- Les données sont déjà écoutées via Firebase (`traitements`)

### Module Coûts (`/couts`)
- Saisie des dépenses (alimentation, vétérinaire, matériel, etc.)
- Répartition par catégorie et par type d'animal
- Les données sont déjà écoutées via Firebase (`couts`)

### Module Profits (`/profits`)
- Enregistrement des ventes
- Calcul automatique profit = ventes - coûts
- `stats.profitGlobal` existe dans le state mais vaut toujours 0
- Les données de ventes sont déjà écoutées via Firebase (`ventes`)

### Module Rapports (`/rapports`)
- Statistiques avancées et graphiques
- Export de données (CSV, PDF)
- Tableaux de bord personnalisés

### Module Matériel (`/materiel`) — Phase 2
- Inventaire du matériel agricole
- Suivi de maintenance

### Autres améliorations possibles
- Authentification Firebase (pas encore implémentée)
- Mode hors-ligne / PWA
- Mode sombre (les variables CSS sont préparées mais pas activées)
- Vue détail d'un animal (clic sur la carte → pas encore implémenté)
- Pagination pour les grandes listes
- Export des données

---

## Configuration Firebase

Créer un fichier `.env.local` à la racine :
```env
NEXT_PUBLIC_FIREBASE_API_KEY=votre_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=votre-projet.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://votre-projet-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre-projet
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=votre-projet.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

### Structure Firebase Realtime Database
```
/
├── animaux/
│   ├── {id}/
│   │   ├── id
│   │   ├── numeroBoucle
│   │   ├── nom
│   │   ├── type
│   │   ├── sexe
│   │   ├── race
│   │   ├── dateNaissance
│   │   ├── ageMois
│   │   ├── poids
│   │   ├── statut
│   │   ├── commentaire
│   │   ├── dateCreation
│   │   └── derniereMAJ
├── traitements/
│   └── {id}/...
├── couts/
│   └── {id}/...
├── ventes/
│   └── {id}/...
└── alertes/
    └── {id}/
        ├── id
        ├── titre
        ├── description
        ├── priorite
        └── statut
```

---

## Commandes

```bash
npm run dev      # Serveur de développement
npm run build    # Build de production
npm run start    # Serveur de production
npm run lint     # Linting ESLint
```
