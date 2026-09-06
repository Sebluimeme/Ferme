"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import firebaseService from "@/lib/firebase-service";
import { onAuthChange } from "@/lib/auth-service";
import type { Unsubscribe } from "firebase/database";
import type { User } from "firebase/auth";
import type { Vehicle, MaintenanceAlert, MaintenanceEntry, MeterReading } from "@/types/vehicle";
import type { Task } from "@/types/task";
import type { Partiel, ActiviteFourrage, DistributionFourrage } from "@/types/fourrage";
import type { Ruche, RecolteMiel, VenteMiel } from "@/types/apiculture";
import { isOperatingTransaction, type Transaction } from "@/types/comptabilite";
import type { ReleverSource } from "@/types/source";
import type { SejourPaturage } from "@/types/paturage";
import type { PleinCarburant } from "@/types/carburant";
import type { WeatherReading } from "@/types/weather";
import type { ChaleurEntry } from "@/services/animal-detail-service";
import { calculateMaintenanceAlerts } from "@/services/vehicle-detail-service";

export interface Animal {
  id: string;
  numeroBoucle?: string;
  nom?: string;
  type: "ovin" | "bovin" | "caprin" | "porcin" | "equin";
  sexe: "M" | "F";
  race?: string;
  dateNaissance?: string;
  ageMois?: number;
  poids?: number;
  poidsSortieKg?: number;
  poidsCarcasseKg?: number;
  statut: "actif" | "vendu" | "mort" | "reforme";
  commentaire?: string;
  numeroBouclePere?: string;
  numeroBoucleMere?: string;
  dateSaillie?: string;
  dureeGestationJours?: number;
  photoUrl?: string;
  photoStoragePath?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface FicheSoin {
  id: string;
  animalId: string;
  titre: string;
  description?: string;
  statut: "en_cours" | "cloture";
  dateDebut: string;
  dateFin?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  photoNom?: string;
  dateCreation?: string;
  derniereMAJ?: string;
}

export interface Alerte {
  id: string;
  titre: string;
  description: string;
  priorite: "haute" | "moyenne" | "basse";
  statut: "active" | "resolue";
}

export interface Composant {
  id: string;
  nom: string;
  reference: string;
}

interface Stats {
  totalAnimaux: number;
  ovins: number;
  bovins: number;
  caprins: number;
  porcins: number;
  profitGlobal: number;
}

interface AppState {
  user: User | null;
  authLoading: boolean;
  animaux: Animal[];
  traitements: FicheSoin[];
  couts: Transaction[];
  ventes: unknown[];
  alertes: Alerte[];
  vehicles: Vehicle[];
  maintenanceEntries: MaintenanceEntry[];
  maintenanceAlerts: MaintenanceAlert[];
  meterReadings: MeterReading[];
  taches: Task[];
  partiels: Partiel[];
  activitesFourrage: ActiviteFourrage[];
  distributionsFourrage: DistributionFourrage[];
  ruches: Ruche[];
  recolteMiel: RecolteMiel[];
  ventesMiel: VenteMiel[];
  relevesSource: ReleverSource[];
  sejoursPaturage: SejourPaturage[];
  carburant: PleinCarburant[];
  weatherReadings: WeatherReading[];
  chaleurs: ChaleurEntry[];
  stats: Stats;
  loading: boolean;
  sidebarOpen: boolean;
}

type Action =
  | { type: "SET_USER"; payload: User | null }
  | { type: "SET_AUTH_LOADING"; payload: boolean }
  | { type: "SET_ANIMAUX"; payload: Animal[] }
  | { type: "SET_TRAITEMENTS"; payload: FicheSoin[] }
  | { type: "SET_COUTS"; payload: Transaction[] }
  | { type: "SET_VENTES"; payload: unknown[] }
  | { type: "SET_ALERTES"; payload: Alerte[] }
  | { type: "SET_VEHICLES"; payload: Vehicle[] }
  | { type: "SET_MAINTENANCE_ENTRIES"; payload: MaintenanceEntry[] }
  | { type: "SET_MAINTENANCE_ALERTS"; payload: MaintenanceAlert[] }
  | { type: "SET_METER_READINGS"; payload: MeterReading[] }
  | { type: "SET_TACHES"; payload: Task[] }
  | { type: "SET_PARTIELS"; payload: Partiel[] }
  | { type: "SET_ACTIVITES_FOURRAGE"; payload: ActiviteFourrage[] }
  | { type: "SET_DISTRIBUTIONS_FOURRAGE"; payload: DistributionFourrage[] }
  | { type: "SET_RUCHES"; payload: Ruche[] }
  | { type: "SET_RECOLTE_MIEL"; payload: RecolteMiel[] }
  | { type: "SET_VENTES_MIEL"; payload: VenteMiel[] }
  | { type: "SET_RELEVES_SOURCE"; payload: ReleverSource[] }
  | { type: "SET_SEJOURS_PATURAGE"; payload: SejourPaturage[] }
  | { type: "SET_CARBURANT"; payload: PleinCarburant[] }
  | { type: "SET_WEATHER_READINGS"; payload: WeatherReading[] }
  | { type: "SET_CHALEURS"; payload: ChaleurEntry[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "CLOSE_SIDEBAR" }
  | { type: "UPDATE_STATS" }
  | { type: "UPDATE_MAINTENANCE_ALERTS" };

function computeStats(animaux: Animal[], couts: Transaction[] = []): Stats {
  const thisYear = new Date().getFullYear().toString();
  const revenus = couts
    .filter(isOperatingTransaction)
    .filter((t) => t.operation === "Revenus" && t.date?.startsWith(thisYear))
    .reduce((sum, t) => sum + t.montant, 0);
  const depenses = couts
    .filter(isOperatingTransaction)
    .filter((t) => t.operation === "Dépenses" && t.date?.startsWith(thisYear))
    .reduce((sum, t) => sum + t.montant, 0);
  return {
    totalAnimaux: animaux.filter((a) => a.statut !== "mort").length,
    ovins: animaux.filter((a) => a.type === "ovin" && a.statut === "actif").length,
    bovins: animaux.filter((a) => a.type === "bovin" && a.statut === "actif").length,
    caprins: animaux.filter((a) => a.type === "caprin" && a.statut === "actif").length,
    porcins: animaux.filter((a) => a.type === "porcin" && a.statut === "actif").length,
    profitGlobal: revenus - depenses,
  };
}

const initialState: AppState = {
  user: null,
  authLoading: true,
  animaux: [],
  traitements: [],
  couts: [],
  ventes: [],
  alertes: [],
  vehicles: [],
  maintenanceEntries: [],
  maintenanceAlerts: [],
  meterReadings: [],
  taches: [],
  partiels: [],
  activitesFourrage: [],
  distributionsFourrage: [],
  ruches: [],
  recolteMiel: [],
  ventesMiel: [],
  relevesSource: [],
  sejoursPaturage: [],
  carburant: [],
  weatherReadings: [],
  chaleurs: [],
  stats: { totalAnimaux: 0, ovins: 0, bovins: 0, caprins: 0, porcins: 0, profitGlobal: 0 },
  loading: true,
  sidebarOpen: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload };
    case "SET_AUTH_LOADING":
      return { ...state, authLoading: action.payload };
    case "SET_ANIMAUX": {
      const animaux = action.payload;
      return { ...state, animaux, stats: computeStats(animaux, state.couts) };
    }
    case "SET_TRAITEMENTS":
      return { ...state, traitements: action.payload };
    case "SET_COUTS": {
      const couts = action.payload;
      return { ...state, couts, stats: computeStats(state.animaux, couts) };
    }
    case "SET_VENTES":
      return { ...state, ventes: action.payload };
    case "SET_ALERTES":
      return { ...state, alertes: action.payload.filter((a) => a.statut === "active") };
    case "SET_VEHICLES":
      return { ...state, vehicles: action.payload };
    case "SET_MAINTENANCE_ENTRIES": {
      const maintenanceEntries = action.payload;
      const alerts = calculateMaintenanceAlerts(state.vehicles, maintenanceEntries, state.meterReadings);
      return { ...state, maintenanceEntries, maintenanceAlerts: alerts };
    }
    case "SET_MAINTENANCE_ALERTS":
      return { ...state, maintenanceAlerts: action.payload };
    case "SET_METER_READINGS": {
      const meterReadings = action.payload;
      const alertsWithReadings = calculateMaintenanceAlerts(state.vehicles, state.maintenanceEntries, meterReadings);
      return { ...state, meterReadings, maintenanceAlerts: alertsWithReadings };
    }
    case "SET_TACHES":
      return { ...state, taches: action.payload };
    case "SET_PARTIELS":
      return { ...state, partiels: action.payload };
    case "SET_ACTIVITES_FOURRAGE":
      return { ...state, activitesFourrage: action.payload };
    case "SET_DISTRIBUTIONS_FOURRAGE":
      return { ...state, distributionsFourrage: action.payload };
    case "SET_RUCHES":
      return { ...state, ruches: action.payload };
    case "SET_RECOLTE_MIEL":
      return { ...state, recolteMiel: action.payload };
    case "SET_VENTES_MIEL": {
      const ventesMiel = action.payload;
      return { ...state, ventesMiel };
    }
    case "SET_RELEVES_SOURCE":
      return { ...state, relevesSource: action.payload };
    case "SET_SEJOURS_PATURAGE":
      return { ...state, sejoursPaturage: action.payload };
    case "SET_CARBURANT":
      return { ...state, carburant: action.payload };
    case "SET_WEATHER_READINGS":
      return { ...state, weatherReadings: action.payload };
    case "SET_CHALEURS":
      return { ...state, chaleurs: action.payload };
    case "UPDATE_MAINTENANCE_ALERTS": {
      const alerts = calculateMaintenanceAlerts(state.vehicles, state.maintenanceEntries, state.meterReadings);
      return { ...state, maintenanceAlerts: alerts };
    }
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "TOGGLE_SIDEBAR":
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case "CLOSE_SIDEBAR":
      return { ...state, sidebarOpen: false };
    case "UPDATE_STATS":
      return { ...state, stats: computeStats(state.animaux, state.couts) };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
  toggleSidebar: () => void;
  closeSidebar: () => void;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const listenersRef = useRef<Unsubscribe[]>([]);
  const pathname = usePathname();

  const toggleSidebar = useCallback(() => dispatch({ type: "TOGGLE_SIDEBAR" }), []);
  const closeSidebar = useCallback(() => dispatch({ type: "CLOSE_SIDEBAR" }), []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthChange((user) => {
      dispatch({ type: "SET_USER", payload: user });
      dispatch({ type: "SET_AUTH_LOADING", payload: false });
    });
    return () => unsub();
  }, []);

  // Charge uniquement les données utiles à l'écran courant. Avant ce découpage,
  // chaque ouverture créait 17 flux Firebase en parallèle, y compris les longs
  // historiques météo et les modules non consultés.
  useEffect(() => {
    if (!state.user) {
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    const listeners: Unsubscribe[] = [];
    const deferredTimers: number[] = [];

    const listen = <T,>(path: string, action: (data: T[]) => Action) => {
      listeners.push(firebaseService.listen<T>(path, (data) => {
        // Une première réponse suffit pour quitter l'état de chargement : chaque écran
        // continue ensuite à hydrater ses données sans masquer l'interface.
        dispatch({ type: "SET_LOADING", payload: false });
        dispatch(action(data));
      }));
    };
    const defer = (callback: () => void) => {
      deferredTimers.push(window.setTimeout(callback, 700));
    };

    const listenAnimaux = () => listen<Animal>("animaux", (animaux) => {
      dispatch({ type: "SET_LOADING", payload: false });
      return { type: "SET_ANIMAUX", payload: animaux };
    });
    const listenTransactions = () => listen<Transaction>("transactions", (data) => ({ type: "SET_COUTS", payload: data }));
    const listenAlertes = () => listen<Alerte>("alertes", (data) => ({ type: "SET_ALERTES", payload: data }));
    const listenVehicules = () => listen<Vehicle>("vehicules", (data) => ({ type: "SET_VEHICLES", payload: data }));
    const listenEntretiens = () => listen<MaintenanceEntry>("vehicules-maintenance", (data) => ({ type: "SET_MAINTENANCE_ENTRIES", payload: data }));
    const listenRelevesVehicule = () => listen<MeterReading>("vehicules-releves", (data) => ({ type: "SET_METER_READINGS", payload: data }));
    const listenTaches = () => listen<Task>("taches", (data) => ({ type: "SET_TACHES", payload: data }));
    const listenPartiels = () => listen<Partiel>("partiels", (data) => ({ type: "SET_PARTIELS", payload: data }));
    const listenActivitesFourrage = () => listen<ActiviteFourrage>("activites-fourrage", (data) => ({ type: "SET_ACTIVITES_FOURRAGE", payload: data }));
    const listenDistributionsFourrage = () => listen<DistributionFourrage>("distributions-fourrage", (data) => ({ type: "SET_DISTRIBUTIONS_FOURRAGE", payload: data }));
    const listenMeteo = () => listen<WeatherReading>("weather-readings", (data) => ({ type: "SET_WEATHER_READINGS", payload: data }));
    // animaux-chaleurs/{animalId}/{chaleurId} : structure imbriquée par animal, à aplatir en liste unique.
    const listenChaleursGlobal = () => {
      listeners.push(firebaseService.listen<Record<string, ChaleurEntry>>("animaux-chaleurs", (data) => {
        dispatch({ type: "SET_LOADING", payload: false });
        const chaleurs = data.flatMap((animalChaleurs) => Object.values(animalChaleurs || {}));
        dispatch({ type: "SET_CHALEURS", payload: chaleurs });
      }));
    };

    // La pastille de notification reste disponible dans toute l'application.
    listenAlertes();

    if (pathname === "/") {
      // Premier affichage : seulement les KPIs essentiels.
      listenAnimaux();
      listenTransactions();
      listenTaches();
      // Rappels reproduction juste sous les KPIs : chargés avec la même priorité.
      listenChaleursGlobal();
      // Les widgets secondaires arrivent après que l'accueil est déjà interactif.
      defer(listenVehicules);
      defer(listenEntretiens);
      defer(listenRelevesVehicule);
      defer(listenActivitesFourrage);
      defer(listenMeteo);
    } else if (pathname === "/animaux" || pathname.startsWith("/animaux/")) {
      listenAnimaux();
      if (pathname === "/animaux") listenChaleursGlobal();
    } else if (pathname === "/reproduction") {
      listenAnimaux();
      listenChaleursGlobal();
    } else if (pathname === "/traitements") {
      listenAnimaux();
      listen<FicheSoin>("traitements", (data) => ({ type: "SET_TRAITEMENTS", payload: data }));
    } else if (pathname === "/taches") {
      listenTaches();
      listenAnimaux();
      listenVehicules();
    } else if (pathname === "/fourrage" || pathname === "/fourrage/partiels") {
      listenPartiels();
      if (pathname === "/fourrage") {
        listenAnimaux();
        listenActivitesFourrage();
        listenDistributionsFourrage();
      }
    } else if (pathname === "/paturage") {
      listenPartiels();
      listen<SejourPaturage>("sejours-paturage", (data) => ({ type: "SET_SEJOURS_PATURAGE", payload: data }));
    } else if (pathname === "/apiculture") {
      listen<Ruche>("ruches", (data) => ({ type: "SET_RUCHES", payload: data }));
      listen<RecolteMiel>("recoltes-miel", (data) => ({ type: "SET_RECOLTE_MIEL", payload: data }));
      listen<VenteMiel>("ventes-miel", (data) => ({ type: "SET_VENTES_MIEL", payload: data }));
      listenTransactions();
    } else if (pathname === "/vehicules" || pathname.startsWith("/vehicules/")) {
      listenVehicules();
    } else if (pathname === "/entretiens") {
      listenVehicules();
      listenEntretiens();
      listenRelevesVehicule();
    } else if (pathname === "/carburant") {
      listen<PleinCarburant>("carburant-pleins", (data) => ({ type: "SET_CARBURANT", payload: data }));
    } else if (pathname === "/meteo") {
      listenMeteo();
      // Les coordonnées des parcelles alimentent les prévisions Open-Meteo.
      listenPartiels();
    } else if (pathname === "/eau") {
      listen<ReleverSource>("releves-source", (data) => ({ type: "SET_RELEVES_SOURCE", payload: data }));
    } else if (pathname === "/couts" || pathname === "/profits" || pathname === "/rapports") {
      listenTransactions();
      if (pathname === "/rapports") listenAnimaux();
    }

    listenersRef.current = listeners;

    return () => {
      deferredTimers.forEach((timer) => window.clearTimeout(timer));
      listenersRef.current.forEach((unsub) => unsub());
    };
  }, [pathname, state.user]);

  return (
    <AppContext.Provider value={{ state, dispatch, toggleSidebar, closeSidebar }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
}
