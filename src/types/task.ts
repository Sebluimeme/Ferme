/**
 * Types pour la gestion des tâches de la ferme
 */

// ==================== Priorité et Statut ====================

export type TaskPriority = "haute" | "moyenne" | "basse";

export type TaskStatus = "a_faire" | "en_cours" | "terminee";

// ==================== Interface Tâche ====================

export interface Task {
  id: string;                          // ID Firebase auto-généré

  // Informations de base
  titre: string;                       // Titre de la tâche
  description?: string;                // Description détaillée
  priorite: TaskPriority;              // Priorité
  statut: TaskStatus;                  // Statut

  // Catégorie (optionnelle)
  categorie?: string;                  // Catégorie libre (comme les races)

  // Échéance
  dateEcheance?: string;               // Date d'échéance (ISO format)

  // Assignation
  assigneA?: string;                   // Personne assignée à la tâche

  // Liens optionnels
  animalId?: string;                   // Référence à un animal
  animalNom?: string;                  // Nom/numéro de l'animal (pour affichage rapide)
  vehiculeId?: string;                 // Référence à un véhicule
  vehiculeNom?: string;                // Nom du véhicule (pour affichage rapide)

  // Photo jointe
  photoUrl?: string;                   // URL de la photo (Firebase Storage)
  photoStoragePath?: string;           // Chemin de stockage (pour suppression)

  // Méta-données (auto-générées)
  dateCreation?: string;               // Date de création
  derniereMAJ?: string;                // Dernière mise à jour
  dateTerminee?: string;               // Date de complétion
}

// ==================== Formulaire ====================

export interface TaskFormData {
  titre: string;
  description?: string;
  priorite: TaskPriority;
  statut: TaskStatus;
  categorie?: string;
  assigneA?: string;
  dateEcheance?: string;
  animalId?: string;
  animalNom?: string;
  vehiculeId?: string;
  vehiculeNom?: string;
}
