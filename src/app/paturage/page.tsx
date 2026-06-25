"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppStore } from "@/store/store";
import { useToast } from "@/components/Toast";
import Modal, { ConfirmModal } from "@/components/Modal";
import { createSejour, updateSejour, deleteSejour, cloreSejour } from "@/services/paturage-service";
import type { SejourPaturage } from "@/types/paturage";
import { getAnimalIcon } from "@/lib/utils";
import * as XLSX from "xlsx";
import { MapPin, Calendar, Download, Plus, Pencil, Trash2, LogOut } from "lucide-react";

// Carte chargée dynamiquement (pas de SSR)
const ParcelSelectorMap = dynamic(() => import("@/components/ParcelSelectorMap"), { ssr: false });

const TYPE_LABELS: Record<SejourPaturage["typeAnimal"], string> = {
  ovin: "Ovins",
  bovin: "Bovins",
  caprin: "Caprins",
  porcin: "Porcins",
  equin: "Équins",
};

const TYPE_COLORS: Record<SejourPaturage["typeAnimal"], string> = {
  ovin:   "bg-green-50 text-green-700 border-green-200",
  bovin:  "bg-amber-50 text-amber-700 border-amber-200",
  caprin: "bg-purple-50 text-purple-700 border-purple-200",
  porcin: "bg-red-50 text-red-700 border-red-200",
  equin:  "bg-stone-100 text-stone-700 border-stone-300",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dureeJours(entree: string, sortie?: string): number {
  const fin = sortie ? new Date(sortie) : new Date();
  return Math.max(0, Math.round((fin.getTime() - new Date(entree).getTime()) / 86400000));
}

// ─── Formulaire ──────────────────────────────────────────────────────────────

interface FormData {
  parcelIds: string[];
  typeAnimal: SejourPaturage["typeAnimal"];
  nombreAnimaux: string;
  dateEntree: string;
  dateSortie: string;
  notes: string;
}

function SejourForm({
  initial,
  partiels,
  animaux,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Partial<FormData>;
  partiels: { id: string; nom: string; surface?: number; geometry?: object }[];
  animaux: { id: string; nom?: string; numeroBoucle?: string; type: string; statut: string }[];
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState<FormData>({
    parcelIds: initial?.parcelIds ?? [],
    typeAnimal: initial?.typeAnimal ?? "ovin",
    nombreAnimaux: initial?.nombreAnimaux ?? "",
    dateEntree: initial?.dateEntree ?? today,
    dateSortie: initial?.dateSortie ?? "",
    notes: initial?.notes ?? "",
  });

  const animauxDuType = useMemo(
    () => animaux.filter((a) => a.type === form.typeAnimal && a.statut === "actif"),
    [animaux, form.typeAnimal]
  );

  // Multi-sélection
  const handleToggle = (id: string) => {
    setForm((p) => ({
      ...p,
      parcelIds: p.parcelIds.includes(id)
        ? p.parcelIds.filter((x) => x !== id)
        : [...p.parcelIds, id],
    }));
  };

  const parcellesAvecGeo = partiels.filter((p) => p.geometry);
  const parcellesSansGeo = partiels.filter((p) => !p.geometry);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">

      {/* Sélection parcelle — carte si géométries dispo */}
      <div className="form-field">
        <label className="form-label">Parcelle *</label>
        {parcellesAvecGeo.length > 0 ? (
          <>
            <p className="form-hint mb-1">Cliquez sur la parcelle sur la carte pour la sélectionner.</p>
            <ParcelSelectorMap
              partiels={partiels}
              selectedIds={form.parcelIds}
              onToggle={handleToggle}
            />
          </>
        ) : (
          <select
            required
            value=""
            onChange={() => {}}
            className="form-input"
          >
            <option value="">Sélectionner une parcelle</option>
            {partiels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}{p.surface ? ` (${p.surface.toFixed(2)} ha)` : ""}
              </option>
            ))}
          </select>
        )}
        {/* Fallback dropdown si parcelles sans géo */}
        {parcellesAvecGeo.length > 0 && parcellesSansGeo.length > 0 && (
          <div className="mt-2">
            <p className="form-hint mb-1">Ou choisir une parcelle sans géométrie :</p>
            <select
              value=""
              onChange={(e) => { if (e.target.value) setForm((p) => ({ ...p, parcelIds: p.parcelIds.includes(e.target.value) ? p.parcelIds : [...p.parcelIds, e.target.value] })); }}
              className="form-input"
            >
              <option value="">—</option>
              {parcellesSansGeo.map((p) => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </div>
        )}
        {/* Validation visuelle */}
        {form.parcelIds.length === 0 && (
          <p className="form-hint text-amber-600">Aucune parcelle sélectionnée</p>
        )}
      </div>

      {/* Type animal */}
      <div className="form-field">
        <label className="form-label">Type d&apos;animal *</label>
        <select
          value={form.typeAnimal}
          onChange={(e) => setForm((p) => ({ ...p, typeAnimal: e.target.value as SejourPaturage["typeAnimal"] }))}
          className="form-input"
        >
          {(Object.keys(TYPE_LABELS) as SejourPaturage["typeAnimal"][]).map((t) => (
            <option key={t} value={t}>{getAnimalIcon(t)} {TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Nombre de têtes */}
      <div className="form-field">
        <label className="form-label">
          Nombre de têtes *
          {animauxDuType.length > 0 && (
            <span className="ml-1 text-stone-400 font-normal">({animauxDuType.length} actifs en base)</span>
          )}
        </label>
        <input
          type="number"
          required
          min="1"
          value={form.nombreAnimaux}
          onChange={(e) => setForm((p) => ({ ...p, nombreAnimaux: e.target.value }))}
          placeholder={animauxDuType.length > 0 ? String(animauxDuType.length) : "Ex: 12"}
          className="form-input"
        />
      </div>

      {/* Dates — 2 colonnes à partir de 480px */}
      <div className="form-row">
        <div className="form-field">
          <label className="form-label">Date d&apos;entrée *</label>
          <input
            type="date"
            required
            value={form.dateEntree}
            onChange={(e) => setForm((p) => ({ ...p, dateEntree: e.target.value }))}
            className="form-input"
          />
        </div>
        <div className="form-field">
          <label className="form-label">Date de sortie</label>
          <input
            type="date"
            value={form.dateSortie}
            min={form.dateEntree}
            onChange={(e) => setForm((p) => ({ ...p, dateSortie: e.target.value }))}
            className="form-input"
          />
          <p className="form-hint">Laisser vide si encore en cours</p>
        </div>
      </div>

      {/* Notes */}
      <div className="form-field">
        <label className="form-label">Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          placeholder="Observations, état de la prairie..."
          className="form-input resize-none"
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-[13px] font-medium bg-stone-100 text-stone-700 border border-stone-200 rounded-lg hover:bg-stone-200 transition-colors cursor-pointer">
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading || form.parcelIds.length === 0}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function PaturagePage() {
  const { state } = useAppStore();
  const { showToast } = useToast();
  const { partiels, animaux, sejoursPaturage } = state;

  const [filterType, setFilterType] = useState<SejourPaturage["typeAnimal"] | "">("");
  const [filterStatut, setFilterStatut] = useState<"en_cours" | "termine" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SejourPaturage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SejourPaturage | null>(null);
  const [cloreTarget, setCloreTarget] = useState<SejourPaturage | null>(null);
  const [saving, setSaving] = useState(false);

  const enCours = useMemo(() => sejoursPaturage.filter((s) => !s.dateSortie), [sejoursPaturage]);
  const termines = useMemo(() => sejoursPaturage.filter((s) => !!s.dateSortie), [sejoursPaturage]);
  const parcellesActives = useMemo(() => new Set(enCours.flatMap((s) => s.parcelIds)).size, [enCours]);
  const animauxEnPature = useMemo(() => enCours.reduce((sum, s) => sum + s.nombreAnimaux, 0), [enCours]);

  const filtered = useMemo(() => {
    let list = [...sejoursPaturage];
    if (filterType) list = list.filter((s) => s.typeAnimal === filterType);
    if (filterStatut === "en_cours") list = list.filter((s) => !s.dateSortie);
    if (filterStatut === "termine") list = list.filter((s) => !!s.dateSortie);
    return list.sort((a, b) => new Date(b.dateEntree).getTime() - new Date(a.dateEntree).getTime());
  }, [sejoursPaturage, filterType, filterStatut]);

  const getParcelNom = (id: string) => partiels.find((p) => p.id === id)?.nom ?? "Parcelle inconnue";
  const getParcelNoms = (ids: string[]) => ids.map(id => getParcelNom(id)).join(", ") || "Parcelle inconnue";
  const getParcel = (id: string) => partiels.find((p) => p.id === id);

  const handleCreate = async (data: FormData) => {
    setSaving(true);
    try {
      const result = await createSejour({
        parcelIds: data.parcelIds,
        typeAnimal: data.typeAnimal,
        nombreAnimaux: parseInt(data.nombreAnimaux),
        dateEntree: data.dateEntree,
        dateSortie: data.dateSortie || undefined,
        notes: data.notes || undefined,
        animalIds: [],
      });
      if (result.success) {
        showToast({ type: "success", title: "Séjour enregistré" });
        setModalOpen(false);
      } else showToast({ type: "error", title: "Erreur", message: result.error });
    } finally { setSaving(false); }
  };

  const handleUpdate = async (data: FormData) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const result = await updateSejour(editTarget.id, {
        parcelIds: data.parcelIds,
        typeAnimal: data.typeAnimal,
        nombreAnimaux: parseInt(data.nombreAnimaux),
        dateEntree: data.dateEntree,
        dateSortie: data.dateSortie || undefined,
        notes: data.notes || undefined,
      });
      if (result.success) {
        showToast({ type: "success", title: "Séjour mis à jour" });
        setEditTarget(null);
      } else showToast({ type: "error", title: "Erreur", message: result.error });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteSejour(deleteTarget.id);
    if (result.success) showToast({ type: "success", title: "Séjour supprimé" });
    else showToast({ type: "error", title: "Erreur", message: result.error });
    setDeleteTarget(null);
  };

  const handleClore = async () => {
    if (!cloreTarget) return;
    const today = new Date().toISOString().split("T")[0];
    const result = await cloreSejour(cloreTarget.id, today);
    if (result.success) showToast({ type: "success", title: "Séjour clôturé" });
    else showToast({ type: "error", title: "Erreur", message: result.error });
    setCloreTarget(null);
  };

  const handleExport = () => {
    const rows = sejoursPaturage.map((s) => {
      const p = getParcel(s.parcelIds?.[0] ?? "");
      return {
        Parcelle: getParcelNoms(s.parcelIds),
        "Surface (ha)": s.parcelIds.map(id => partiels.find(p=>p.id===id)?.surface ?? "").filter(Boolean).join(", "),
        "Type animal": TYPE_LABELS[s.typeAnimal],
        "Nb têtes": s.nombreAnimaux,
        Entrée: formatDate(s.dateEntree),
        Sortie: s.dateSortie ? formatDate(s.dateSortie) : "En cours",
        "Durée (jours)": dureeJours(s.dateEntree, s.dateSortie),
        Notes: s.notes ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pâturage");
    XLSX.writeFile(wb, `paturage-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Pâturage</h1>
          <p className="text-[13px] text-stone-400 mt-0.5">Suivi des séjours par parcelle — traçabilité bio</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            Nouveau séjour
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "En cours", value: enCours.length, sub: "séjours actifs", accent: "text-brand-600" },
          { label: "Parcelles occupées", value: parcellesActives, sub: "en ce moment", accent: "text-stone-900" },
          { label: "Animaux en pâture", value: animauxEnPature, sub: "têtes actuellement", accent: "text-stone-900" },
          { label: "Total séjours", value: sejoursPaturage.length, sub: `dont ${termines.length} terminés`, accent: "text-stone-900" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-stone-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-stone-400 mb-2">{kpi.label}</p>
            <p className={`text-[24px] font-semibold tracking-tight leading-none ${kpi.accent}`}>{kpi.value}</p>
            <p className="text-[12px] text-stone-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Séjours en cours */}
      {enCours.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
            <MapPin className="w-4 h-4 text-stone-400" />
            <span className="text-[13px] font-semibold text-stone-800">En cours</span>
            <span className="ml-auto text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full">{enCours.length}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {enCours.map((s) => {
              const p = getParcel(s.parcelIds[0]);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-stone-800 truncate">{getParcelNoms(s.parcelIds)}</span>
                      {p?.surface && <span className="text-[11px] text-stone-400 shrink-0">{p.surface.toFixed(2)} ha</span>}
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${TYPE_COLORS[s.typeAnimal]}`}>
                        {getAnimalIcon(s.typeAnimal)} {s.nombreAnimaux} {TYPE_LABELS[s.typeAnimal]}
                      </span>
                    </div>
                    <p className="text-[12px] text-stone-400 mt-0.5">
                      Entrée le {formatDate(s.dateEntree)} · {dureeJours(s.dateEntree)}j
                      {s.notes && <> · <span className="italic">{s.notes}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setCloreTarget(s)} title="Clore"
                      className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer">
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditTarget(s)}
                      className="p-1.5 text-stone-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(s)}
                      className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap mb-4">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as SejourPaturage["typeAnimal"] | "")}
          className="px-3 py-1.5 text-[13px] bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none focus:border-brand-500 cursor-pointer">
          <option value="">Tous les animaux</option>
          {(Object.keys(TYPE_LABELS) as SejourPaturage["typeAnimal"][]).map((t) => (
            <option key={t} value={t}>{getAnimalIcon(t)} {TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value as "en_cours" | "termine" | "")}
          className="px-3 py-1.5 text-[13px] bg-white border border-stone-200 rounded-lg text-stone-700 focus:outline-none focus:border-brand-500 cursor-pointer">
          <option value="">Tous</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminés</option>
        </select>
      </div>

      {/* Historique */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-stone-500">Aucun séjour enregistré</p>
          <p className="text-[13px] text-stone-400 mt-1 mb-5">
            {sejoursPaturage.length === 0 ? "Enregistrez le premier passage d'animaux sur une parcelle" : "Aucun résultat pour ces filtres"}
          </p>
          {sejoursPaturage.length === 0 && (
            <button onClick={() => setModalOpen(true)}
              className="px-4 py-2 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer">
              + Nouveau séjour
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
            <Calendar className="w-4 h-4 text-stone-400" />
            <span className="text-[13px] font-semibold text-stone-800">Historique</span>
            <span className="ml-auto text-[11px] text-stone-400">{filtered.length} séjour{filtered.length > 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-stone-100">
            {filtered.map((s) => {
              const p = getParcel(s.parcelIds?.[0] ?? "");
              const isEnCours = !s.dateSortie;
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEnCours ? "bg-brand-400" : "bg-stone-300"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-stone-800 truncate">{getParcelNoms(s.parcelIds)}</span>
                      {p?.surface && <span className="text-[11px] text-stone-400 shrink-0">{p.surface.toFixed(2)} ha</span>}
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${TYPE_COLORS[s.typeAnimal]}`}>
                        {getAnimalIcon(s.typeAnimal)} {s.nombreAnimaux} {TYPE_LABELS[s.typeAnimal]}
                      </span>
                      {isEnCours && <span className="text-[11px] font-semibold text-brand-600 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded-full shrink-0">En cours</span>}
                    </div>
                    <p className="text-[12px] text-stone-400 mt-0.5">
                      {formatDate(s.dateEntree)}{s.dateSortie ? ` → ${formatDate(s.dateSortie)}` : " → aujourd'hui"}
                      {" · "}{dureeJours(s.dateEntree, s.dateSortie)}j
                      {s.notes && <> · <span className="italic">{s.notes}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isEnCours && (
                      <button onClick={() => setCloreTarget(s)} title="Clore"
                        className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer">
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setEditTarget(s)}
                      className="p-1.5 text-stone-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteTarget(s)}
                      className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau séjour de pâturage" size="large">
        <SejourForm partiels={partiels} animaux={animaux} onSubmit={handleCreate} onCancel={() => setModalOpen(false)} loading={saving} />
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Modifier le séjour" size="large">
        {editTarget && (
          <SejourForm
            partiels={partiels} animaux={animaux}
            initial={{
              parcelIds: editTarget.parcelIds,
              typeAnimal: editTarget.typeAnimal,
              nombreAnimaux: String(editTarget.nombreAnimaux),
              dateEntree: editTarget.dateEntree,
              dateSortie: editTarget.dateSortie ?? "",
              notes: editTarget.notes ?? "",
            }}
            onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} loading={saving}
          />
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!cloreTarget} onClose={() => setCloreTarget(null)} onConfirm={handleClore}
        title="Clore le séjour"
        message={`Clore le séjour de <strong>${cloreTarget ? TYPE_LABELS[cloreTarget.typeAnimal] : ""}</strong> sur <strong>${cloreTarget ? getParcelNoms(cloreTarget.parcelIds) : ""}</strong> ?<br>La date de sortie sera fixée à aujourd'hui.`}
        confirmText="Clore"
      />

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Supprimer le séjour"
        message="Voulez-vous vraiment supprimer ce séjour ? Cette action est irréversible."
        confirmText="Supprimer" danger
      />
    </div>
  );
}
