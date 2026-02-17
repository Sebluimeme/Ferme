"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import type { VehicleDocument, DocumentType, MaintenanceEntry } from "@/types/vehicle";
import {
  addDocument,
  deleteDocument,
  listenDocuments,
  listenMaintenanceEntries,
} from "@/services/vehicle-detail-service";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  getDocumentTypeLabel,
  getDocumentTypeIcon,
  getMaintenanceTypeLabel,
  getMaintenanceTypeIcon,
  isExpired,
  isApproaching,
} from "@/lib/vehicle-utils";

interface VehicleDocumentsProps {
  vehicleId: string;
}

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "carte_grise", label: "Carte grise" },
  { value: "assurance", label: "Assurance" },
  { value: "controle_technique", label: "Contrôle technique" },
  { value: "facture_achat", label: "Facture d'achat" },
  { value: "manuel", label: "Manuel" },
  { value: "autre", label: "Autre" },
];

export default function VehicleDocuments({ vehicleId }: VehicleDocumentsProps) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VehicleDocument | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const unsubDocs = listenDocuments(vehicleId, (data) => {
      setDocuments(
        data.sort(
          (a, b) =>
            new Date(b.dateCreation || "").getTime() -
            new Date(a.dateCreation || "").getTime()
        )
      );
    });
    const unsubMaintenance = listenMaintenanceEntries(vehicleId, (data) => {
      setMaintenanceEntries(
        data
          .filter((e) => e.facture)
          .sort((a, b) => {
            const dateA = a.dateEffectuee || a.datePlanifiee || "";
            const dateB = b.dateEffectuee || b.datePlanifiee || "";
            return dateB.localeCompare(dateA);
          })
      );
    });
    return () => {
      unsubDocs();
      unsubMaintenance();
    };
  }, [vehicleId]);

  const handleAddDocument = async () => {
    if (!formRef.current || !selectedFile) {
      showToast({ type: "error", title: "Erreur", message: "Veuillez sélectionner un fichier" });
      return;
    }

    const formData = new FormData(formRef.current);
    const nom = (formData.get("nom") as string)?.trim();
    const type = (formData.get("type") as DocumentType) || "autre";
    const dateDocument = formData.get("dateDocument") as string;
    const dateExpiration = formData.get("dateExpiration") as string;
    const description = formData.get("description") as string;

    if (!nom) {
      showToast({ type: "error", title: "Erreur", message: "Le nom du document est obligatoire" });
      return;
    }

    setUploading(true);
    try {
      const result = await addDocument(
        vehicleId,
        selectedFile,
        nom,
        type,
        dateDocument || undefined,
        dateExpiration || undefined,
        description?.trim() || undefined
      );

      if (result.success) {
        showToast({ type: "success", title: "Succès", message: "Document ajouté" });
        setShowAddForm(false);
        setSelectedFile(null);
        formRef.current?.reset();
      } else {
        showToast({ type: "error", title: "Erreur", message: result.error || "Erreur lors de l'ajout" });
      }
    } catch {
      showToast({ type: "error", title: "Erreur", message: "Erreur lors de l'upload" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteDocument(deleteTarget.id, deleteTarget.storagePath);
    if (result.success) {
      showToast({ type: "success", title: "Succès", message: "Document supprimé" });
    } else {
      showToast({ type: "error", title: "Erreur", message: result.error || "Erreur" });
    }
    setDeleteTarget(null);
  };

  function getFileIcon(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return "🖼️";
    if (ext === "pdf") return "📄";
    return "📎";
  }

  function getExpirationBadge(dateExpiration?: string) {
    if (!dateExpiration) return null;
    if (isExpired(dateExpiration)) {
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
          Expiré
        </span>
      );
    }
    if (isApproaching(dateExpiration, 30)) {
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
          Expire bientôt
        </span>
      );
    }
    return null;
  }

  return (
    <div>
      {/* === Section Documents du véhicule === */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Documents du véhicule</h3>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary to-secondary rounded-lg hover:from-primary-dark hover:to-secondary-dark cursor-pointer transition-colors"
          >
            + Ajouter un document
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 mb-1">Aucun document</p>
            <p className="text-gray-400 text-sm">
              Ajoutez carte grise, assurance, contrôle technique...
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors ${
                  doc.dateExpiration && isExpired(doc.dateExpiration)
                    ? "bg-red-50/50"
                    : doc.dateExpiration && isApproaching(doc.dateExpiration, 30)
                    ? "bg-orange-50/50"
                    : ""
                }`}
              >
                <span className="text-2xl flex-shrink-0">
                  {getDocumentTypeIcon(doc.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{doc.nom}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                      {getDocumentTypeLabel(doc.type)}
                    </span>
                    {getExpirationBadge(doc.dateExpiration)}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {doc.dateDocument && (
                      <span>Date : {formatDate(doc.dateDocument)}</span>
                    )}
                    {doc.dateExpiration && (
                      <span>
                        {doc.dateDocument ? " · " : ""}
                        Expiration : {formatDate(doc.dateExpiration)}
                      </span>
                    )}
                    {!doc.dateDocument && !doc.dateExpiration && doc.dateCreation && (
                      <span>Ajouté le {formatDate(doc.dateCreation)}</span>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{doc.description}</p>
                  )}
                </div>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 flex-shrink-0"
                >
                  Ouvrir
                </a>
                <button
                  onClick={() => setDeleteTarget(doc)}
                  className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 cursor-pointer bg-transparent border-none flex-shrink-0"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* === Section Factures d'entretien === */}
      {maintenanceEntries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Factures d'entretien</h3>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {maintenanceEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
              >
                <span className="text-2xl flex-shrink-0">
                  {entry.type ? getMaintenanceTypeIcon(entry.type) : "🧾"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {entry.titre || "Entretien"}
                    </span>
                    {entry.type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex-shrink-0">
                        {getMaintenanceTypeLabel(entry.type)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {entry.dateEffectuee && (
                      <span>{formatDate(entry.dateEffectuee)}</span>
                    )}
                    {entry.garage && (
                      <span>
                        {entry.dateEffectuee ? " · " : ""}
                        {entry.garage}
                      </span>
                    )}
                    {entry.coutTotal && (
                      <span>
                        {entry.dateEffectuee || entry.garage ? " · " : ""}
                        {formatCurrency(entry.coutTotal)}
                      </span>
                    )}
                  </div>
                </div>
                <a
                  href={entry.facture!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 flex-shrink-0"
                >
                  Voir la facture
                </a>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 ml-1">
            Ces factures sont gérées depuis l'onglet Entretien
          </p>
        </div>
      )}

      {/* === Modal Ajout de document === */}
      <Modal
        isOpen={showAddForm}
        onClose={() => {
          setShowAddForm(false);
          setSelectedFile(null);
          formRef.current?.reset();
        }}
        title="Ajouter un document"
        size="medium"
      >
        <form ref={formRef} className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Nom du document *
              </label>
              <input
                type="text"
                name="nom"
                placeholder="Ex: Carte grise Tracteur"
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Type de document
              </label>
              <select name="type" defaultValue="autre" className="w-full px-3 py-2 border rounded-lg">
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {getDocumentTypeIcon(dt.value)} {dt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Date du document
              </label>
              <input
                type="date"
                name="dateDocument"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700">
                Date d'expiration
              </label>
              <input
                type="date"
                name="dateExpiration"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              type="text"
              name="description"
              placeholder="Description optionnelle..."
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">
              Fichier *
            </label>
            {selectedFile ? (
              <div className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-gray-50">
                <span className="text-lg">{getFileIcon(selectedFile.name)}</span>
                <span className="text-sm truncate flex-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                >
                  Retirer
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full px-3 py-6 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-gray-400 text-sm">
                  Cliquez pour sélectionner un fichier (PDF, image...)
                </span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
              }}
            />
          </div>
        </form>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={() => {
              setShowAddForm(false);
              setSelectedFile(null);
              formRef.current?.reset();
            }}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleAddDocument}
            disabled={uploading || !selectedFile}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50 cursor-pointer"
          >
            {uploading ? "Upload..." : "Ajouter"}
          </button>
        </div>
      </Modal>

      {/* === Modal Confirmation suppression === */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer le document"
        size="small"
      >
        <p className="text-gray-700">
          Voulez-vous vraiment supprimer <strong>{deleteTarget?.nom}</strong> ?
        </p>
        <div className="flex gap-3 justify-end mt-6">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-200 cursor-pointer"
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
