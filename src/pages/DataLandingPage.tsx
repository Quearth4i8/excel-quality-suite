import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAppStore } from "@/store/app-store";
import { detectSheet } from "@/lib/auto-detect";
import { BarChart2, Users, ArrowRight } from "lucide-react";

const DataLandingPage = () => {
  const navigate = useNavigate();
  const files = useAppStore((s) => s.files);

  const spcCount = files.filter((f) => {
    if (f.uploadMode) return f.uploadMode === "spc";
    return f.sheets.some((s) => { const k = detectSheet(s).kind; return k === "spc" || k === "spc-card"; });
  }).length;

  const msaCount = files.filter((f) => {
    if (f.uploadMode) return f.uploadMode === "msa";
    return f.sheets.some((s) => { const k = detectSheet(s).kind; return k === "msa" || k === "msa-rr"; });
  }).length;

  return (
    <AppLayout title="Données" subtitle="Choisissez le type de données à gérer">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mt-8">

        {/* SPC */}
        <button
          onClick={() => navigate("/data/spc")}
          className="group flex flex-col gap-5 p-8 rounded-2xl border-2 border-border hover:border-blue-500/60 hover:bg-blue-500/5 transition-all text-left cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <BarChart2 className="w-7 h-7 text-blue-500" />
            </div>
            {spcCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-500 text-sm font-semibold">
                {spcCount} fichier{spcCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">SPC</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Contrôle Statistique des Procédés — sous-groupes et mesures pour cartes de contrôle
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-blue-500 group-hover:gap-3 transition-all">
            Gérer les données SPC
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* MSA */}
        <button
          onClick={() => navigate("/data/msa")}
          className="group flex flex-col gap-5 p-8 rounded-2xl border-2 border-border hover:border-violet-500/60 hover:bg-violet-500/5 transition-all text-left cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Users className="w-7 h-7 text-violet-500" />
            </div>
            {msaCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-500 text-sm font-semibold">
                {msaCount} fichier{msaCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">MSA (R&R)</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Analyse des Systèmes de Mesure — Pièce, Opérateur, Essai et Valeur pour études R&amp;R
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-violet-500 group-hover:gap-3 transition-all">
            Gérer les données MSA
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>

      </div>
    </AppLayout>
  );
};

export default DataLandingPage;
