import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export function Login({ onAuth }: { onAuth: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
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
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Compte cree ! Verifiez votre email pour confirmer.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      }
    } catch (err: any) {
      toast.error(err.message || "Erreur d'authentification");
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
          <h2 className="text-lg font-black text-marine mb-6">
            {isSignUp ? "Creer un compte" : "Connexion"}
          </h2>

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
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all disabled:opacity-50"
            >
              {loading
                ? "Chargement..."
                : isSignUp
                ? "Creer le compte"
                : "Se connecter"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-bold text-muted hover:text-rose transition-colors"
            >
              {isSignUp
                ? "Deja un compte ? Se connecter"
                : "Pas encore de compte ? S'inscrire"}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted/50 mt-6">
          &copy; 2026 Bright Conseil — Bright Social Hub
        </p>
      </div>
    </div>
  );
}
