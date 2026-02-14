/**
 * Templates d'entretien prédéfinis
 * Intervalles recommandés pour différents types de véhicules
 */

import type { MaintenanceTemplate, VehicleType } from "@/types/vehicle";

export const MAINTENANCE_TEMPLATES: MaintenanceTemplate[] = [
  // ==================== VIDANGE ====================
  {
    id: "vidange_essence",
    nom: "Vidange moteur essence",
    type: "vidange",
    description: "Changement huile moteur + filtre à huile",
    intervalKm: 10000,
    intervalMois: 12,
    applicableTo: ["voiture", "moto", "quad", "utilitaire"],
    piecesTypiques: ["Huile moteur (4-5L)", "Filtre à huile", "Joint de bouchon"],
  },
  {
    id: "vidange_diesel",
    nom: "Vidange moteur diesel",
    type: "vidange",
    description: "Changement huile moteur + filtre à huile",
    intervalKm: 15000,
    intervalMois: 12,
    applicableTo: ["voiture", "tracteur", "utilitaire"],
    piecesTypiques: ["Huile moteur diesel (5-7L)", "Filtre à huile", "Joint de bouchon"],
  },
  {
    id: "vidange_tracteur",
    nom: "Vidange tracteur",
    type: "vidange",
    description: "Vidange huile moteur + transmission",
    intervalHeures: 200,
    intervalMois: 12,
    applicableTo: ["tracteur"],
    piecesTypiques: ["Huile moteur", "Huile transmission", "Filtres"],
  },

  // ==================== FILTRES ====================
  {
    id: "filtre_air",
    nom: "Remplacement filtre à air",
    type: "filtres",
    description: "Changement du filtre à air moteur",
    intervalKm: 20000,
    intervalMois: 24,
    applicableTo: ["voiture", "moto", "quad", "tracteur", "utilitaire"],
    piecesTypiques: ["Filtre à air"],
  },
  {
    id: "filtre_habitacle",
    nom: "Remplacement filtre habitacle",
    type: "filtres",
    description: "Changement du filtre à pollen / climatisation",
    intervalKm: 15000,
    intervalMois: 12,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: ["Filtre habitacle"],
  },
  {
    id: "filtre_gasoil",
    nom: "Remplacement filtre à gasoil",
    type: "filtres",
    description: "Changement du filtre à gasoil",
    intervalKm: 30000,
    intervalMois: 24,
    applicableTo: ["voiture", "tracteur", "utilitaire"],
    piecesTypiques: ["Filtre à gasoil"],
  },

  // ==================== FREINS ====================
  {
    id: "plaquettes_avant",
    nom: "Remplacement plaquettes avant",
    type: "freins",
    description: "Changement des plaquettes de frein avant",
    intervalKm: 30000,
    applicableTo: ["voiture", "moto", "utilitaire"],
    piecesTypiques: ["Plaquettes avant", "Liquide de frein"],
  },
  {
    id: "plaquettes_arriere",
    nom: "Remplacement plaquettes arrière",
    type: "freins",
    description: "Changement des plaquettes de frein arrière",
    intervalKm: 50000,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: ["Plaquettes arrière", "Liquide de frein"],
  },
  {
    id: "disques_freins",
    nom: "Remplacement disques de frein",
    type: "freins",
    description: "Changement des disques de frein (avant ou arrière)",
    intervalKm: 60000,
    applicableTo: ["voiture", "moto", "utilitaire"],
    piecesTypiques: ["Disques de frein", "Plaquettes", "Liquide de frein"],
  },
  {
    id: "liquide_frein",
    nom: "Purge liquide de frein",
    type: "freins",
    description: "Remplacement du liquide de frein",
    intervalKm: 40000,
    intervalMois: 24,
    applicableTo: ["voiture", "moto", "utilitaire"],
    piecesTypiques: ["Liquide de frein DOT 4 ou 5.1"],
  },

  // ==================== PNEUS ====================
  {
    id: "permutation_pneus",
    nom: "Permutation des pneus",
    type: "pneus",
    description: "Rotation des pneus pour usure uniforme",
    intervalKm: 10000,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: [],
  },
  {
    id: "remplacement_pneus",
    nom: "Remplacement pneus",
    type: "pneus",
    description: "Changement des pneus usés",
    intervalKm: 40000,
    applicableTo: ["voiture", "moto", "quad", "tracteur", "utilitaire"],
    piecesTypiques: ["Pneus", "Valves"],
  },
  {
    id: "geometrie",
    nom: "Contrôle géométrie",
    type: "pneus",
    description: "Vérification et réglage de la géométrie",
    intervalKm: 20000,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: [],
  },

  // ==================== COURROIES ====================
  {
    id: "courroie_distribution",
    nom: "Remplacement courroie de distribution",
    type: "courroie",
    description: "Changement courroie de distribution + pompe à eau (recommandé)",
    intervalKm: 100000,
    intervalMois: 60,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: ["Kit courroie de distribution", "Pompe à eau", "Galet tendeur"],
  },
  {
    id: "courroie_accessoires",
    nom: "Remplacement courroie d'accessoires",
    type: "courroie",
    description: "Changement de la courroie d'accessoires",
    intervalKm: 60000,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: ["Courroie d'accessoires"],
  },

  // ==================== BATTERIE ====================
  {
    id: "batterie",
    nom: "Remplacement batterie",
    type: "batterie",
    description: "Changement de la batterie",
    intervalMois: 48,
    applicableTo: ["voiture", "moto", "quad", "tracteur", "utilitaire"],
    piecesTypiques: ["Batterie"],
  },

  // ==================== CLIMATISATION ====================
  {
    id: "recharge_clim",
    nom: "Recharge climatisation",
    type: "climatisation",
    description: "Contrôle et recharge du circuit de climatisation",
    intervalMois: 24,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: ["Gaz réfrigérant", "Huile compresseur"],
  },

  // ==================== CONTRÔLE TECHNIQUE ====================
  {
    id: "ct_voiture",
    nom: "Contrôle technique",
    type: "controle_technique",
    description: "Contrôle technique obligatoire",
    intervalMois: 24,
    applicableTo: ["voiture", "utilitaire"],
    piecesTypiques: [],
  },
  {
    id: "ct_tracteur",
    nom: "Contrôle technique agricole",
    type: "controle_technique",
    description: "Contrôle technique pour véhicule agricole",
    intervalMois: 60,
    applicableTo: ["tracteur"],
    piecesTypiques: [],
  },

  // ==================== RÉVISION COMPLÈTE ====================
  {
    id: "revision_complete",
    nom: "Révision complète",
    type: "revision",
    description: "Révision générale du véhicule selon préconisations constructeur",
    intervalKm: 30000,
    intervalMois: 24,
    applicableTo: ["voiture", "moto", "quad", "utilitaire"],
    piecesTypiques: [
      "Huile moteur",
      "Filtres (air, huile, habitacle)",
      "Liquides (frein, refroidissement)",
      "Bougies d'allumage",
    ],
  },
  {
    id: "revision_tracteur",
    nom: "Révision tracteur",
    type: "revision",
    description: "Révision complète tracteur",
    intervalHeures: 500,
    intervalMois: 12,
    applicableTo: ["tracteur"],
    piecesTypiques: [
      "Huile moteur",
      "Huile hydraulique",
      "Huile transmission",
      "Filtres",
      "Graissage général",
    ],
  },
];

/**
 * Récupère les templates applicables à un type de véhicule
 */
export function getTemplatesForVehicleType(vehicleType: VehicleType): MaintenanceTemplate[] {
  return MAINTENANCE_TEMPLATES.filter((template) => template.applicableTo.includes(vehicleType));
}

/**
 * Récupère un template par son ID
 */
export function getTemplateById(id: string): MaintenanceTemplate | undefined {
  return MAINTENANCE_TEMPLATES.find((template) => template.id === id);
}

/**
 * Récupère les templates par type d'entretien
 */
export function getTemplatesByMaintenanceType(
  maintenanceType: MaintenanceTemplate["type"]
): MaintenanceTemplate[] {
  return MAINTENANCE_TEMPLATES.filter((template) => template.type === maintenanceType);
}
