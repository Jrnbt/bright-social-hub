import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export function Login({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email et mot de passe requis");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onAuth();
    } catch {
      // Message generique — ne revele jamais si l'email existe ou non
      toast.error("Email ou mot de passe incorrect");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 rounded-lg border border-border text-sm font-semibold bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-marine tracking-tight">
            Bright <span className="text-rose">Social Hub</span>
          </h1>
          <p className="text-sm text-muted font-semibold mt-2">
            Gestion Sociale — Bright Conseil
          </p>
        </div>

        <div className="bg-white rounded-xl border border-border shadow-sm p-8">
          <h2 className="text-lg font-black text-marine mb-6">Connexion</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Email
              </label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@brightconseil.fr"
                autoComplete="email"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                maxLength={128}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all disabled:opacity-50"
            >
              {loading ? "Chargement..." : "Se connecter"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Acces reserve a l'equipe Bright Conseil.
            <br />
            Contactez votre administrateur pour obtenir un compte.
          </p>
        </div>

        <p className="text-center text-[11px] text-muted/50 mt-6">
          &copy; 2026 Bright Conseil — Bright Social Hub
        </p>
      </div>
    </div>
  );
}
