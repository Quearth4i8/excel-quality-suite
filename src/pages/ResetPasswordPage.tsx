import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false); // true once Supabase fires PASSWORD_RECOVERY

  // Supabase fires PASSWORD_RECOVERY when the user lands here from the email link.
  // The SDK automatically exchanges the token in the URL hash for a session.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check if there's already a session (edge case: user opened the link
    // in the same browser tab where they were previously logged in).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour. Vous pouvez vous connecter.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast.error("Erreur", { description: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page-root">
      <div className="login-bg-gradient" />
      <div className="login-grid-overlay" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="login-glass-card rounded-2xl p-8">

            <div className="flex items-center gap-2 mb-6">
              <img src="/logo.png" alt="CrimpControl" className="h-6 w-6 object-contain" />
              <span className="text-white/70 text-sm font-medium">CrimpControl</span>
            </div>

            {!ready ? (
              /* Waiting for the token to be exchanged */
              <div className="text-center space-y-3 py-6">
                <svg className="animate-spin h-8 w-8 text-blue-400 mx-auto" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-white/60 text-sm">Vérification du lien…</p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-white">Nouveau mot de passe</h2>
                  <p className="text-sm text-white/50 mt-1">
                    Choisissez un mot de passe sécurisé d'au moins 6 caractères.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-white/70">Nouveau mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoFocus
                        className="login-input pr-10"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-white/70">Confirmer le mot de passe</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={6}
                      className="login-input"
                    />
                    {confirm && password !== confirm && (
                      <p className="text-xs text-red-400">Les mots de passe ne correspondent pas.</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-semibold bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={busy || password !== confirm}
                  >
                    {busy ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Enregistrement…
                      </span>
                    ) : "Enregistrer le mot de passe"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
