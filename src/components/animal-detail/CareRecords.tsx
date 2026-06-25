"use client";

import { useState, useRef } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import { addSoin, updateSoin, cloturerSoin, rouvrirSoin, deleteSoin } from "@/services/animal-detail-service";
import { formatDate } from "@/lib/utils";
import type { FicheSoin } from "@/store/store";

interface CareRecordsProps {
  animalId: string;
  soins: FicheSoin[];
}

export default function CareRecords({ animalId, soins }: CareRecordsProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editSoin, setEditSoin] = useState<FicheSoin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FicheSoin | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"tous" | "en_cours" | "cloture">("tous");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const filteredSoins = soins
    .filter((s) => filter === "tous" || s.statut === filter)
    .sort((a, b) => new Date(b.dateDebut).getTime() - new Date(a.dateDebut).getTime());

  const enCoursCount = soins.filter((s) => s.statut === "en_cours").length;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const titre = (formData.get("titre") as string).trim();
    const description = (formData.get("description") as string).trim() || undefined;
    const dateDebut = formData.get("dateDebut") as string;
    const file = fileRef.current?.files?.[0] || undefined;

    if (!titre || !dateDebut) {
      showToast({ type: "error", title: "Erreur", message: "Titre et date obligatoires" });
      return;
    }

    setSaving(true);
    try {
      if (editSoin) {
        const result = await updateSoin(
          editSoin.id,
          { animalId, titre, description, dateDebut },
          file,
          file ? editSoin.photoStoragePath : undefined
        );
        if (result.success) {
          showToast({ type: "success", title: "Succes", message: "Fiche soins modifiee" });
          closeModal();
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
        }
      } else {
        const result = await addSoin(animalId, { titre, description, dateDebut }, file);
        if (result.success) {
          showToast({ type: "success", title: "Succes", message: "Fiche soins ajoutee" });
          closeModal();
        } else {
          showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
        }
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'enregistrement" });
    } finally {
      setSaving(false);
    }
  };

  const handleCloturer = async (soin: FicheSoin) => {
    const result = await cloturerSoin(soin.id);
    if (result.success) {
      showToast({ type: "success", title: "Succes", message: "Traitement cloture" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  const handleRouvrir = async (soin: FicheSoin) => {
    const result = await rouvrirSoin(soin.id);
    if (result.success) {
      showToast({ type: "success", title: "Succes", message: "Traitement reouvert" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteSoin(deleteTarget.id, deleteTarget.photoStoragePath);
    if (result.success) {
      showToast({ type: "success", title: "Succes", message: "Fiche soins supprimee" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
    setDeleteTarget(null);
  };

  const openEdit = (soin: FicheSoin) => {
    setEditSoin(soin);
    setShowForm(false);
  };

  const closeModal = () => {
    setShowForm(false);
    setEditSoin(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Fiches soins</h2>
          {enCoursCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
              {enCoursCount} en cours
            </span>
          )}
        </div>
        <button
          onClick={() => { setEditSoin(null); setShowForm(true); }}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer"
        >
          + Nouvelle fiche
        </button>
      </div>

      {/* Filtres */}
      {soins.length > 0 && (
        <div className="flex gap-2 mb-4">
          {(["tous", "en_cours", "cloture"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                filter === f
                  ? "bg-brand-600 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {f === "tous" ? "Tous" : f === "en_cours" ? "En cours" : "Clotures"}
            </button>
          ))}
        </div>
      )}

      {filteredSoins.length === 0 ? (
        <div className="text-center py-12 text-stone-400">
          <div className="text-4xl mb-2">💊</div>
          <p>{soins.length === 0 ? "Aucune fiche soins" : "Aucun resultat pour ce filtre"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSoins.map((soin) => (
            <div
              key={soin.id}
              className={`border rounded-lg p-4 ${
                soin.statut === "en_cours"
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-stone-200 bg-stone-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        soin.statut === "en_cours" ? "bg-amber-500" : "bg-green-500"
                      }`}
                    />
                    <h3 className="font-medium text-sm truncate">{soin.titre}</h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                        soin.statut === "en_cours"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {soin.statut === "en_cours" ? "En cours" : "Cloture"}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mb-1">
                    Debut : {formatDate(soin.dateDebut)}
                    {soin.dateFin && <> &middot; Fin : {formatDate(soin.dateFin)}</>}
                  </div>
                  {soin.description && (
                    <p className="text-sm text-stone-600 mt-2 whitespace-pre-wrap">{soin.description}</p>
                  )}
                  {soin.photoUrl && (
                    <button
                      onClick={() => setPhotoPreview(soin.photoUrl!)}
                      className="mt-2 flex items-center gap-1.5 text-xs text-brand-600 hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      <span>📎</span>
                      <span>{soin.photoNom || "Ordonnance"}</span>
                    </button>
                  )}
                </div>
                {soin.photoUrl && (
                  <button
                    onClick={() => setPhotoPreview(soin.photoUrl!)}
                    className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-stone-200 cursor-pointer bg-transparent p-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={soin.photoUrl}
                      alt="Ordonnance"
                      className="w-full h-full object-cover"
                    />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-stone-200/50">
                {soin.statut === "en_cours" ? (
                  <button
                    onClick={() => handleCloturer(soin)}
                    className="text-xs text-green-600 hover:text-green-800 cursor-pointer bg-transparent border-none p-0 font-medium"
                  >
                    Cloturer
                  </button>
                ) : (
                  <button
                    onClick={() => handleRouvrir(soin)}
                    className="text-xs text-amber-600 hover:text-amber-800 cursor-pointer bg-transparent border-none p-0 font-medium"
                  >
                    Rouvrir
                  </button>
                )}
                <span className="text-stone-300">|</span>
                <button
                  onClick={() => openEdit(soin)}
                  className="text-xs text-brand-600 hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Modifier
                </button>
                <span className="text-stone-300">|</span>
                <button
                  onClick={() => setDeleteTarget(soin)}
                  className="text-xs text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none p-0"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal ajout/edition */}
      <Modal
        isOpen={showForm || !!editSoin}
        onClose={closeModal}
        title={editSoin ? "Modifier la fiche soins" : "Nouvelle fiche soins"}
        size="medium"
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Titre du traitement *</label>
            <input
              type="text"
              name="titre"
              defaultValue={editSoin?.titre || ""}
              required
              placeholder="Ex : Antibiotique, Vermifuge, Vaccination..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Date de debut *</label>
            <input
              type="date"
              name="dateDebut"
              defaultValue={editSoin?.dateDebut || new Date().toISOString().split("T")[0]}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">Description / Instructions</label>
            <textarea
              name="description"
              defaultValue={editSoin?.description || ""}
              placeholder="Posologie, frequence, duree du traitement..."
              rows={4}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/10 resize-y"
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-stone-700">
              Photo / Ordonnance {editSoin?.photoUrl ? "(remplacer)" : "(optionnel)"}
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="w-full text-sm text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-600/10 file:text-brand-600 hover:file:bg-brand-600/20 file:cursor-pointer"
            />
            {editSoin?.photoUrl && !fileRef.current?.files?.length && (
              <p className="text-xs text-stone-400 mt-1">
                Photo actuelle : {editSoin.photoNom || "ordonnance"}
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 cursor-pointer disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : editSoin ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview photo */}
      <Modal isOpen={!!photoPreview} onClose={() => setPhotoPreview(null)} title="Ordonnance" size="large">
        {photoPreview && (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoPreview}
              alt="Ordonnance veterinaire"
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
            <a
              href={photoPreview}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200"
            >
              Ouvrir dans un nouvel onglet
            </a>
          </div>
        )}
      </Modal>

      {/* Confirm delete */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer la fiche soins" size="small">
        <p className="text-stone-700">
          Voulez-vous vraiment supprimer la fiche <strong>{deleteTarget?.titre}</strong> ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium bg-stone-100 text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 cursor-pointer"
          >
            Supprimer
          </button>
        </div>
      </Modal>
    </div>
  );
}