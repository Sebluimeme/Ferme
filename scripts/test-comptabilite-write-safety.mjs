#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  clearedOptionalFields,
  deleteTransactionWithAttachment,
  parsePositiveDecimal,
  requiresInvoiceService,
  saveTransactionWithAttachment,
} from "../src/services/comptabilite-write-safety.ts";

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const file = { name: "facture.pdf" };
const oldPath = "transactions/ancienne.pdf";
const newPath = "transactions/nouvelle.pdf";

function scenario({ uploadFails = false, saveFails = false, cleanupFails = false, saveThrows = false } = {}) {
  const events = [];
  const files = new Set([oldPath]);
  let storedAttachment = oldPath;
  const storage = {
    async uploadFile(path) {
      events.push(`upload:${path}`);
      if (uploadFails) return { success: false, error: "Réseau interrompu" };
      files.add(path);
      return { success: true, url: "https://example.invalid/facture" };
    },
    async deleteFile(path) {
      events.push(`delete:${path}`);
      // L'invariant métier est vérifié au moment du nettoyage, pas seulement
      // sur un ordre attendu : aucun document référencé ne peut disparaître.
      assert.notEqual(path, storedAttachment);
      if (cleanupFails) return { success: false, error: "Stockage indisponible" };
      files.delete(path);
      return { success: true };
    },
  };
  return {
    events,
    files,
    get storedAttachment() { return storedAttachment; },
    saveOptions: {
      file,
      previousStoragePath: oldPath,
      loadStorage: async () => storage,
      storagePath: () => newPath,
      save: async (attachment) => {
        events.push("save");
        if (saveThrows) throw new Error("Réponse interrompue");
        if (saveFails) return { success: false, error: "Écriture refusée" };
        storedAttachment = attachment?.storagePath || storedAttachment;
        return { success: true, id: "ecriture" };
      },
    },
    deleteOptions: {
      storagePath: oldPath,
      loadStorage: async () => storage,
      remove: async () => {
        events.push("remove");
        if (saveFails) return { success: false, error: "Suppression refusée" };
        storedAttachment = undefined;
        return { success: true };
      },
    },
  };
}

await test("les montants utilisent toute la saisie et acceptent la virgule française", () => {
  assert.equal(parsePositiveDecimal(" 12,50 ", 2), 12.5);
  assert.equal(parsePositiveDecimal("0.01", 2), 0.01);
  for (const input of ["12 euros", "12.50abc", "12,50.10", "1e3", "Infinity", "-2", "0", "", "3.141", "90071992547410"]) {
    assert.equal(parsePositiveDecimal(input, 2), null, input);
  }
  assert.equal(parsePositiveDecimal("1,125"), 1.125);
  assert.equal(parsePositiveDecimal("1 kg"), null);
});

await test("vider les informations facultatives produit les null attendus par Firebase update", () => {
  assert.deepEqual(clearedOptionalFields({ remarque: " ", fournisseur: "", quantite: " " }), {
    remarque: null, fournisseur: null, quantite: null,
  });
  assert.deepEqual(clearedOptionalFields({ remarque: " reçu ", fournisseur: " fournisseur ", quantite: "1,5" }), {
    remarque: "reçu", fournisseur: "fournisseur", quantite: 1.5,
  });
});

await test("les factures, même partiellement renseignées, sont exclues des modifications legacy", () => {
  assert.equal(requiresInvoiceService({ typeFacture: "achat" }), true);
  assert.equal(requiresInvoiceService({ factureVersion: 1, allocations: [] }), true);
  assert.equal(requiresInvoiceService({ montant: 12, categorie: "Charges" }), false);
});

await test("une perte réseau pendant l'upload ne crée aucune écriture et conserve l'ancien document", async () => {
  const state = scenario({ uploadFails: true });
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, false);
  assert.match(result.error, /pas été enregistrée/);
  assert.deepEqual(state.events, [`upload:${newPath}`]);
  assert.deepEqual([...state.files], [oldPath]);
});

await test("le remplacement confirme la nouvelle référence avant d'effacer l'ancien fichier", async () => {
  const state = scenario();
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, true);
  assert.equal(state.storedAttachment, newPath);
  assert.deepEqual([...state.files], [newPath]);
  assert.deepEqual(state.events, [`upload:${newPath}`, "save", `delete:${oldPath}`]);
});

await test("un refus d'écriture conserve l'ancien justificatif et nettoie uniquement le nouveau", async () => {
  const state = scenario({ saveFails: true });
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, false);
  assert.equal(state.storedAttachment, oldPath);
  assert.deepEqual([...state.files], [oldPath]);
  assert.deepEqual(state.events, [`upload:${newPath}`, "save", `delete:${newPath}`]);
});

await test("un résultat d'écriture indéterminé préserve les deux documents par précaution", async () => {
  const state = scenario({ saveThrows: true });
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, false);
  assert.match(result.error, /Vérifiez la liste/);
  assert.ok(result.warning);
  assert.deepEqual([...state.files], [oldPath, newPath]);
  assert.deepEqual(state.events, [`upload:${newPath}`, "save"]);
});

await test("un nettoyage échoué après remplacement reste un succès avec avertissement", async () => {
  const state = scenario({ cleanupFails: true });
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, true);
  assert.ok(result.warning);
  assert.equal(state.storedAttachment, newPath);
  assert.deepEqual([...state.files], [oldPath, newPath]);
});

await test("un nettoyage échoué après refus d'écriture reste un échec avec avertissement", async () => {
  const state = scenario({ saveFails: true, cleanupFails: true });
  const result = await saveTransactionWithAttachment(state.saveOptions);
  assert.equal(result.success, false);
  assert.ok(result.warning);
  assert.equal(state.storedAttachment, oldPath);
  assert.deepEqual([...state.files], [oldPath, newPath]);
});

await test("une suppression refusée ne tente pas d'effacer le justificatif", async () => {
  const state = scenario({ saveFails: true });
  const result = await deleteTransactionWithAttachment(state.deleteOptions);
  assert.equal(result.success, false);
  assert.deepEqual(state.events, ["remove"]);
  assert.deepEqual([...state.files], [oldPath]);
});

await test("la suppression du fichier suit la confirmation de suppression de l'écriture", async () => {
  const state = scenario();
  const result = await deleteTransactionWithAttachment(state.deleteOptions);
  assert.equal(result.success, true);
  assert.deepEqual(state.events, ["remove", `delete:${oldPath}`]);
  assert.equal(state.files.size, 0);
});

await test("le nettoyage impossible d'une suppression confirmée est signalé sans inviter à supprimer à nouveau", async () => {
  const state = scenario({ cleanupFails: true });
  const result = await deleteTransactionWithAttachment(state.deleteOptions);
  assert.equal(result.success, true);
  assert.match(result.warning, /écriture est supprimée/);
});

await test("sans nouveau justificatif, aucune connexion au stockage n'est nécessaire", async () => {
  let saved = false;
  const result = await saveTransactionWithAttachment({
    loadStorage: async () => { throw new Error("Ne doit pas être appelé"); },
    storagePath: () => { throw new Error("Ne doit pas être appelé"); },
    save: async (attachment) => {
      assert.equal(attachment, undefined);
      saved = true;
      return { success: true };
    },
  });
  assert.equal(result.success, true);
  assert.equal(saved, true);
});

console.log(`${passed} tests de sauvegarde comptable réussis, sans connexion Firebase.`);
