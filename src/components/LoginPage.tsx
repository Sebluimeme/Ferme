"use client";

import { useState } from "react";
import { login } from "@/lib/auth-service";
import { Wheat } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch {
      setError("Email ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2.5 text-[14px] bg-stone-100 border border-stone-200 rounded-lg text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all";

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mb-4">
            <Wheat className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[20px] font-semibold text-white tracking-[-0.3px]">La Ferme Tabouche</h1>
          <p className="text-[13px] text-stone-500 mt-1">Connectez-vous pour accéder à l'application</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-stone-900 border border-stone-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="px-3 py-2.5 rounded-lg bg-red-950/60 border border-red-900/60 text-red-400 text-[13px]">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-stone-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="votre@email.com"
              className={inputClass}
              style={{ background: "#1c1917", color: "#e7e5e4", borderColor: "#44403c" }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-stone-400">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className={inputClass}
              style={{ background: "#1c1917", color: "#e7e5e4", borderColor: "#44403c" }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-[13px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
