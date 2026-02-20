"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import firebaseService from "@/lib/firebase-service";
import { onAuthChange } from "@/lib/auth-service";
import type { Unsubscribe } from "firebase/database";
import type { User } from "firebase/auth";
import type { Vehicle, MaintenanceAlert, MaintenanceEntry, MeterReading } from "@/types/vehicle";
import type { Task } from "@/types/task";
import { calculateMaintenanceAlerts } from "@/services/vehicle-detail-service";

export interface Animal {
  id: string;
  numeroBoucle?: string;
  nom?: string;
  type: "ovin" | "bovin" | "caprin" | "porcin";
  sexe: "M" | "F";
  race?: string;
  dateNaissance?: string;
  ageMois?: number;
  poids?: number;
  statut: "actif" | "vendu" | "mort" | "reforme";
  commentaire?: string;
  numeroBouclePere?: string;
  numeroBoucleMere?: string;
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

export interface Materiel {
  id: string;
  nom: string;
  type: "vehicule" | "outil" | "machine" | "autre";
  marque?: string;
  modele?: string;
  annee?: number;
  immatriculation?: string;
  statut: "actif" | "en_panne" | "vendu" | "reforme";
  commentaire?: string;
  composants: Composant[];
  dateCreation?: string;
  derniereMAJ?: string;
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
  materiels: Materiel[];
  traitements: FicheSoin[];
  couts: unknown[];
  ventes: unknown[];
  alertes: Alerte[];
  vehicles: Vehicle[];
  maintenanceEntries: MaintenanceEntry[];
  maintenanceAlerts: MaintenanceAlert[];
  meterReadings: MeterReading[];
  taches: Task[];
  stats: Stats;
  loading: boolean;
  sidebarOpen: boolean;
}

type Action =
  | { type: "SET_USER"; payload: User | null }
  | { type: "SET_AUTH_LOADING"; payload: boolean }
  | { type: "SET_ANIMAUX"; payload: Animal[] }
  | { type: "SET_MATERIELS"; payload: Materiel[] }
  | { type: "SET_TRAITEMENTS"; payload: FicheSoin[] }
  | { type: "SET_COUTS"; payload: unknown[] }
  | { type: "SET_VENTES"; payload: unknown[] }
  | { type: "SET_ALERTES"; payload: Alerte[] }
  | { type: "SET_VEHICLES"; payload: Vehicle[] }
  | { type: "SET_MAINTENANCE_ENTRIES"; payload: MaintenanceEntry[] }
  | { type: "SET_MAINTENANCE_ALERTS"; payload: MaintenanceAlert[] }
  | { type: "SET_METER_READINGS"; payload: MeterReading[] }
  | { type: "SET_TACHES"; payload: Task[] }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "CLOSE_SIDEBAR" }
  | { type: "UPDATE_STATS" }
  | { type: "UPDATE_MAINTENANCE_ALERTS" };

function computeStats(animaux: Animal[]): Stats {
  return {
    totalAnimaux: animaux.length,
    ovins: animaux.filter((a) => a.type === "ovin" && a.statut === "actif").length,
    bovins: animaux.filter((a) => a.type === "bovin" && a.statut === "actif").length,
    caprins: animaux.filter((a) => a.type === "caprin" && a.statut === "actif").length,
    porcins: animaux.filter((a) => a.type === "porcin" && a.statut === "actif").length,
    profitGlobal: 0,
  };
}

const initialState: AppState = {
  user: null,
  authLoading: true,
  animaux: [],
  materiels: [],
  traitements: [],
  couts: [],
  ventes: [],
  alertes: [],
  vehicles: [],
  maintenanceEntries: [],
  maintenanceAlerts: [],
  meterReadings: [],
  taches: [],
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
      return { ...state, animaux, stats: computeStats(animaux) };
    }
    case "SET_MATERIELS":
      return { ...state, materiels: action.payload };
    case "SET_TRAITEMENTS":
      return { ...state, traitements: action.payload };
    case "SET_COUTS":
      return { ...state, couts: action.payload };
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
      return { ...state, stats: computeStats(state.animaux) };
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

  // Data listeners - only when authenticated
  useEffect(() => {
    if (!state.user) {
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    const listeners: Unsubscribe[] = [];

    listeners.push(
      firebaseService.listen<Animal>("animaux", (animaux) => {
        dispatch({ type: "SET_ANIMAUX", payload: animaux });
        dispatch({ type: "SET_LOADING", payload: false });
      })
    );
    listeners.push(
      firebaseService.listen<Materiel>("materiels", (data) => dispatch({ type: "SET_MATERIELS", payload: data }))
    );
    listeners.push(
      firebaseService.listen<FicheSoin>("traitements", (data) => dispatch({ type: "SET_TRAITEMENTS", payload: data }))
    );
    listeners.push(
      firebaseService.listen("couts", (data) => dispatch({ type: "SET_COUTS", payload: data }))
    );
    listeners.push(
      firebaseService.listen("ventes", (data) => dispatch({ type: "SET_VENTES", payload: data }))
    );
    listeners.push(
      firebaseService.listen<Alerte>("alertes", (data) => dispatch({ type: "SET_ALERTES", payload: data }))
    );
    listeners.push(
      firebaseService.listen<Vehicle>("vehicules", (data) => {
        dispatch({ type: "SET_VEHICLES", payload: data });
        dispatch({ type: "UPDATE_MAINTENANCE_ALERTS" });
      })
    );
    listeners.push(
      firebaseService.listen<MaintenanceEntry>("vehicules-maintenance", (data) =>
        dispatch({ type: "SET_MAINTENANCE_ENTRIES", payload: data })
      )
    );
    listeners.push(
      firebaseService.listen<MeterReading>("vehicules-releves", (data) =>
        dispatch({ type: "SET_METER_READINGS", payload: data })
      )
    );
    listeners.push(
      firebaseService.listen<Task>("taches", (data) =>
        dispatch({ type: "SET_TACHES", payload: data })
      )
    );

    listenersRef.current = listeners;

    return () => {
      listenersRef.current.forEach((unsub) => unsub());
    };
  }, [state.user]);

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
