import { AppLayout } from "@/components/layout/AppLayout";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { SpecsPanel } from "@/components/specs/SpecsPanel";

const SettingsPage = () => (
  <AppLayout title="Paramètres" subtitle="Configuration du projet et de l'application">
    <div className="mb-5">
      <SpecsPanel />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <SectionCard title="Application">
        <ul className="space-y-3 text-sm">
          <li className="flex justify-between py-2 border-b border-border/50"><span className="text-muted-foreground">Version</span><span className="font-semibold">1.1.0</span></li>
          <li className="flex justify-between py-2 border-b border-border/50"><span className="text-muted-foreground">Backend</span><span className="font-semibold">Supabase (PostgreSQL)</span></li>
          <li className="flex justify-between py-2 border-b border-border/50"><span className="text-muted-foreground">Source de données</span><span className="font-semibold">Fichiers Excel (multi-import)</span></li>
          <li className="flex justify-between py-2"><span className="text-muted-foreground">Stockage</span><span className="font-semibold">Supabase DB + localStorage (fallback)</span></li>
        </ul>
      </SectionCard>
      <SectionCard title="Conventions">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• <strong className="text-foreground">SPC</strong> : Sous-groupe | Mesure1 | Mesure2 | …</li>
          <li>• <strong className="text-foreground">MSA</strong> : Pièce | Opérateur | Essai | Valeur</li>
          <li>• <strong className="text-foreground">Capabilité</strong> : une colonne de valeurs</li>
          <li>• Constantes SPC fournies pour n = 2 à 10</li>
          <li>• Règles Western Electric (1, 2, 3, 4) actives</li>
          <li>• Multi-import : fusion automatique des colonnes communes</li>
        </ul>
      </SectionCard>
    </div>
  </AppLayout>
);

export default SettingsPage;
