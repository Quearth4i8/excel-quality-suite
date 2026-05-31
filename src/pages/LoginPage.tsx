import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { notificationActions } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthContext";
import { ArrowLeft, BarChart3, Eye, EyeOff, Shield, TrendingUp } from "lucide-react";

const orbStyles = [
  { top: "10%", left: "15%", size: 500, color: "hsl(217, 91%, 60%)", delay: 0, duration: 20 },
  { top: "60%", left: "70%", size: 400, color: "hsl(262, 83%, 58%)", delay: -5, duration: 25 },
  { top: "30%", left: "80%", size: 350, color: "hsl(199, 89%, 48%)", delay: -10, duration: 22 },
  { top: "70%", left: "20%", size: 450, color: "hsl(142, 71%, 45%)", delay: -8, duration: 28 },
  { top: "5%", left: "55%", size: 300, color: "hsl(25, 95%, 53%)", delay: -3, duration: 18 },
];

const features = [
  { icon: BarChart3, label: "SPC & Maîtrise statistique" },
  { icon: Shield, label: "MSA & Fidélité des mesures" },
  { icon: TrendingUp, label: "Capabilité & Incertitude" },
];

const LoginPage = () => {
  const { signInWithPassword, resetPasswordForEmail, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("redirectTo") ?? "/";
    return raw.startsWith("/") ? raw : "/";
  }, [location.search]);

  const [email, setEmail] = useState(() => localStorage.getItem("login_remember_email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => localStorage.getItem("login_remember_email") !== null);
  const [busy, setBusy] = useState(false);

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotBusy(true);
    try {
      await resetPasswordForEmail(forgotEmail);
      setForgotSent(true);
    } catch (err: any) {
      toast.error("Erreur", { description: err?.message ?? String(err) });
    } finally {
      setForgotBusy(false);
    }
  };

  useEffect(() => {
    if (user) navigate(redirectTo, { replace: true });
  }, [navigate, redirectTo, user]);

  if (user) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signInWithPassword({ email, password });
      if (remember) {
        localStorage.setItem("login_remember_email", email);
      } else {
        localStorage.removeItem("login_remember_email");
      }
      toast.success("Connecté");
      notificationActions.add({ type: "success", title: "Connecté", message: "Vous êtes maintenant connecté." });
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      toast.error("Erreur d'authentification", { description: err?.message ?? String(err) });
      notificationActions.add({ type: "error", title: "Erreur d'authentification", message: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page-root">
      <div className="login-bg-gradient" />

      {orbStyles.map((orb, i) => (
        <div
          key={i}
          className="login-orb"
          style={{
            top: orb.top,
            left: orb.left,
            width: orb.size,
            height: orb.size,
            background: `radial-gradient(circle, ${orb.color}44 0%, ${orb.color}11 50%, transparent 70%)`,
            animationDelay: `${orb.delay}s`,
            animationDuration: `${orb.duration}s`,
          }}
        />
      ))}

      <div className="login-grid-overlay" />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left side — branding */}
          <div className="login-fade-left flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 px-4 py-1.5 text-sm text-white/80 mb-6">
              <BarChart3 className="h-4 w-4" />
              Excel Quality Suite
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight mb-4">
              Qualité
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                sans compromis
              </span>
            </h1>
            <p className="text-lg text-white/60 max-w-md mx-auto lg:mx-0 mb-8">
              Maîtrisez vos processus, analysez vos données et garantissez la conformité — le tout dans une seule suite.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              {features.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center gap-2 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-2.5 text-sm text-white/70"
                >
                  <f.icon className="h-4 w-4 text-blue-400" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right side — login / forgot password card */}
          <div className="w-full max-w-md login-fade-right">
            <div className="login-glass-card rounded-2xl p-8">

              {/* ── Forgot password sent confirmation ── */}
              {forgotMode && forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h2 className="text-xl font-bold text-white">Email envoyé !</h2>
                  <p className="text-sm text-white/60">
                    Un lien de réinitialisation a été envoyé à <span className="text-white font-medium">{forgotEmail}</span>. Vérifiez votre boîte de réception (et vos spams).
                  </p>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }}
                    className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Retour à la connexion
                  </button>
                </div>

              /* ── Forgot password form ── */
              ) : forgotMode ? (
                <>
                  <div className="mb-6">
                    <button
                      type="button"
                      onClick={() => { setForgotMode(false); setForgotEmail(""); }}
                      className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-4"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Retour
                    </button>
                    <h2 className="text-2xl font-bold text-white">Mot de passe oublié</h2>
                    <p className="text-sm text-white/50 mt-1">
                      Entrez votre email pour recevoir un lien de réinitialisation.
                    </p>
                  </div>
                  <form onSubmit={onForgot} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email" className="text-white/70">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        autoFocus
                        placeholder="votre@email.com"
                        className="login-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-semibold bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                      disabled={forgotBusy}
                    >
                      {forgotBusy ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Envoi…
                        </span>
                      ) : "Envoyer le lien"}
                    </Button>
                  </form>
                </>

              /* ── Login form ── */
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-white">Connexion</h2>
                    <p className="text-sm text-white/50 mt-1">
                      Connectez-vous pour accéder à vos projets.
                    </p>
                  </div>
                  <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-white/70">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="login-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-white/70">Mot de passe</Label>
                        <button
                          type="button"
                          onClick={() => { setForgotMode(true); setForgotEmail(email); }}
                          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          className="login-input pr-10"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="remember"
                        checked={remember}
                        onCheckedChange={(v) => setRemember(!!v)}
                        className="border-white/20 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                      />
                      <Label htmlFor="remember" className="text-sm text-white/50 cursor-pointer select-none">
                        Se souvenir de moi
                      </Label>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-semibold bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98]"
                      disabled={busy}
                    >
                      {busy ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Connexion…
                        </span>
                      ) : "Se connecter"}
                    </Button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
