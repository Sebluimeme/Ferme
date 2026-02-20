"use client";

import type { Materiel } from "@/store/store";

interface MaterielFormProps {
  materiel?: Materiel | null;
  formRef: React.RefObject<HTMLFormElement | null>;
}

export default function MaterielForm({ materiel, formRef }: MaterielFormProps) {
  return (
    <form ref={formRef} className="grid gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="nom"
            defaultValue={materiel?.nom || ""}
            required
            placeholder="Tracteur John Deere 6120M"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            name="type"
            defaultValue={materiel?.type || ""}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          >
            <option value="">Sélectionnez...</option>
            <option value="vehicule">🚜 Véhicule</option>
            <option value="outil">🔧 Outil</option>
            <option value="machine">⚙️ Machine</option>
            <option value="autre">🧰 Autre</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Marque</label>
          <input
            type="text"
            name="marque"
            defaultValue={materiel?.marque || ""}
            placeholder="John Deere, Massey Ferguson..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Modèle</label>
          <input
            type="text"
            name="modele"
            defaultValue={materiel?.modele || ""}
            placeholder="6120M, 5455..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Année</label>
          <input
            type="number"
            name="annee"
            defaultValue={materiel?.annee || ""}
            placeholder="2020"
            min="1900"
            max="2100"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
        <div>
          <label className="block mb-1 text-sm font-medium text-gray-700">Immatriculation</label>
          <input
            type="text"
            name="immatriculation"
            defaultValue={materiel?.immatriculation || ""}
            placeholder="AB-123-CD"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">Statut</label>
        <select
          name="statut"
          defaultValue={materiel?.statut || "actif"}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
        >
          <option value="actif">Actif</option>
          <option value="en_panne">En panne</option>
          <option value="vendu">Vendu</option>
          <option value="reforme">Réformé</option>
        </select>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-gray-700">Commentaire</label>
        <textarea
          name="commentaire"
          defaultValue={materiel?.commentaire || ""}
          placeholder="Notes supplémentaires..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-y min-h-[100px]"
        />
      </div>
    </form>
  );
}
