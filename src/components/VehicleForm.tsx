"use client";

import type { Vehicle } from "@/types/vehicle";

interface VehicleFormProps {
  vehicle?: Vehicle | null;
  formRef: React.RefObject<HTMLFormElement | null>;
}

export default function VehicleForm({ vehicle, formRef }: VehicleFormProps) {
  return (
    <form ref={formRef} className="grid gap-4">
      {/* Type et Statut */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Type de véhicule <span className="text-red-500">*</span>
          </label>
          <select
            name="type"
            defaultValue={vehicle?.type || ""}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="voiture">🚗 Voiture</option>
            <option value="moto">🏍️ Moto</option>
            <option value="quad">🛺 Quad</option>
            <option value="tracteur">🚜 Tracteur</option>
            <option value="utilitaire">🚐 Utilitaire</option>
            <option value="remorque">🚚 Remorque</option>
          </select>
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Statut <span className="text-red-500">*</span>
          </label>
          <select
            name="statut"
            defaultValue={vehicle?.statut || "actif"}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="actif">✅ Actif</option>
            <option value="en_reparation">🔧 En réparation</option>
            <option value="stocke">📦 Stocké</option>
            <option value="vendu">💰 Vendu</option>
            <option value="reforme">❌ Réformé</option>
          </select>
        </div>
      </div>

      {/* Marque et Modèle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Marque</label>
          <input
            type="text"
            name="marque"
            defaultValue={vehicle?.marque || ""}
            placeholder="Renault, John Deere..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Modèle</label>
          <input
            type="text"
            name="modele"
            defaultValue={vehicle?.modele || ""}
            placeholder="Clio, 6250R..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      {/* Plaque et Date mise en circulation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Plaque d&apos;immatriculation</label>
          <input
            type="text"
            name="plaqueImmatriculation"
            defaultValue={vehicle?.plaqueImmatriculation || ""}
            placeholder="AB-123-CD"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Date de mise en circulation</label>
          <input
            type="date"
            name="dateMiseEnCirculation"
            defaultValue={vehicle?.dateMiseEnCirculation || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      {/* Kilométrage et Heures */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Kilométrage actuel (km)</label>
          <input
            type="number"
            name="kilometrage"
            defaultValue={vehicle?.kilometrage || ""}
            placeholder="50000"
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Heures d&apos;utilisation (h)</label>
          <input
            type="number"
            name="heuresUtilisation"
            defaultValue={vehicle?.heuresUtilisation || ""}
            placeholder="1200"
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
          <p className="text-xs text-gray-500 mt-1">Principalement pour tracteurs et machines agricoles</p>
        </div>
      </div>

      {/* Puissance, Valeur achat, Date achat */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Puissance (CV)</label>
          <input
            type="number"
            name="puissance"
            defaultValue={vehicle?.puissance || ""}
            placeholder="90"
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Valeur d&apos;achat (€)</label>
          <input
            type="number"
            name="valeurAchat"
            defaultValue={vehicle?.valeurAchat || ""}
            placeholder="15000"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Date d&apos;achat</label>
          <input
            type="date"
            name="dateAchat"
            defaultValue={vehicle?.dateAchat || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      {/* Prochain CT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Prochain contrôle technique</label>
          <input
            type="date"
            name="dateProchainCT"
            defaultValue={vehicle?.dateProchainCT || ""}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      {/* Commentaire */}
      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">Commentaires</label>
        <textarea
          name="commentaire"
          defaultValue={vehicle?.commentaire || ""}
          rows={3}
          placeholder="Notes, particularités..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        />
      </div>
    </form>
  );
}
