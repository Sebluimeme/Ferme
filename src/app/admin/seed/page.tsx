"use client";

import { useState } from "react";
import { createAnimal } from "@/services/animal-service";

const HORSES = [
  { nom: "Una", type: "equin" as const, sexe: "F" as const, race: "Haflinger", statut: "actif" as const },
  { nom: "Jocker", type: "equin" as const, sexe: "M" as const, race: "Pur-sang Arabe", statut: "actif" as const },
];

export default function SeedPage() {
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const lines: string[] = [];
    for (const horse of HORSES) {
      const res = await createAnimal(horse);
      if (res.success) {
        lines.push(`✅ ${horse.nom} (${horse.race}) ajouté — id: ${res.data?.id ?? "?"}`);
      } else {
        lines.push(`❌ ${horse.nom} : ${res.error}`);
      }
    }
    setLog(lines);
    setDone(true);
    setRunning(false);
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded-xl shadow">
      <h1 className="text-xl font-bold mb-2">🐴 Seed — Ajout des chevaux</h1>
      <p className="text-sm text-gray-500 mb-4">
        Ajoute Una (Haflinger, F) et Jocker (Pur-sang Arabe, M) dans Firebase.
        À utiliser une seule fois, puis supprimer cette page.
      </p>
      {!done ? (
        <button
          onClick={run}
          disabled={running}
          className="bg-amber-600 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
        >
          {running ? "En cours..." : "Ajouter Una & Jocker"}
        </button>
      ) : (
        <div className="space-y-2">
          {log.map((l, i) => (
            <p key={i} className="text-sm font-mono bg-gray-50 p-2 rounded">{l}</p>
          ))}
          <p className="text-xs text-gray-400 mt-4">Tu peux supprimer le fichier src/app/admin/seed/page.tsx</p>
        </div>
      )}
    </div>
  );
}
