import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore, appActions, ColumnMapping } from "@/store/app-store";
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { notificationActions } from "@/lib/notifications";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STEPS = ["Détection", "SPC / Capabilité", "MSA", "Spécifications", "Validation"] as const;

export const MappingWizard = ({ open, onOpenChange }: Props) => {
  const sheet = useAppStore(() => appActions.getAnalysisSheet());
  const mapping = useAppStore((s) => s.mapping);
  const specs = useAppStore((s) => s.specs);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ColumnMapping>(mapping);
  const [draftSpecs, setDraftSpecs] = useState(specs);

  const headers = sheet?.headers ?? [];

  // Auto-detect on first open
  const autoDetect = useMemo(() => {
    if (!sheet) return null;
    const h = sheet.headers;
    const findCol = (patterns: RegExp[]) =>
      h.find((c) => patterns.some((p) => p.test(c.toLowerCase()))) ?? null;
    const measureCols = h.filter((c) => /mesure|measure|m\d+|x\d|val/i.test(c));
    return {
      measureCols: measureCols.length ? measureCols : [],
      partCol: findCol([/pi[èe]ce|part/]),
      operatorCol: findCol([/op[eé]rateur|operator/]),
      trialCol: findCol([/essai|trial|repet/]),
      valueCol: findCol([/^valeur$|^value$/]),
      lslCol: findCol([/^lsl$|limite.*inf/]),
      uslCol: findCol([/^usl$|limite.*sup/]),
    };
  }, [sheet]);

  const applyAutoDetect = () => {
    if (!autoDetect) return;
    setDraft({ ...draft, ...autoDetect, validated: false });
    toast.success("Détection automatique appliquée", {
      description: `${autoDetect.measureCols.length} col. de mesures détectées`,
    });
  };

  const toggleMeasure = (col: string) => {
    setDraft({
      ...draft,
      measureCols: draft.measureCols.includes(col)
        ? draft.measureCols.filter((c) => c !== col)
        : [...draft.measureCols, col],
    });
  };

  // Validation rules
  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!sheet) errors.push("Aucune feuille active.");
    if (sheet && draft.measureCols.length === 0)
      errors.push("Sélectionnez au moins une colonne de mesure (SPC/Capabilité).");
    // Numeric check on measures
    if (sheet && draft.measureCols.length > 0) {
      const sample = sheet.rows.slice(0, 50);
      const bad: string[] = [];
      draft.measureCols.forEach((c) => {
        const ok = sample.filter((r) => !isNaN(Number(r[c]))).length;
        if (ok / Math.max(sample.length, 1) < 0.5) bad.push(c);
      });
      if (bad.length) errors.push(`Colonnes non numériques : ${bad.join(", ")}`);
    }
    // MSA partial
    const msaCols = [draft.partCol, draft.operatorCol, draft.valueCol].filter(Boolean).length;
    if (msaCols > 0 && msaCols < 3) warnings.push("Mappage MSA incomplet (Pièce, Opérateur, Valeur requis).");
    // Specs
    if (draftSpecs.lsl >= draftSpecs.usl) errors.push("LSL doit être strictement inférieur à USL.");
    if (draftSpecs.target < draftSpecs.lsl || draftSpecs.target > draftSpecs.usl)
      warnings.push("La cible n'est pas comprise entre LSL et USL.");
    return { errors, warnings, ok: errors.length === 0 };
  }, [draft, draftSpecs, sheet]);

  const finish = () => {
    appActions.setMapping({ ...draft, validated: true });
    appActions.setSpecs(draftSpecs);
    toast.success("Configuration validée", { description: "Vos analyses utilisent maintenant ce mappage." });
    notificationActions.add({
      type: "success",
      title: "Configuration validée",
      message: "Vos analyses utilisent maintenant ce mappage.",
    });
    onOpenChange(false);
    setStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Assistant de mappage des colonnes
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold ${
                  i < step
                    ? "bg-success text-success-foreground"
                    : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              <span className={i === step ? "font-semibold" : "text-muted-foreground"}>{s}</span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>

        <div className="min-h-[280px] py-2">
          {!sheet && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Importez d'abord un fichier Excel sur la page <strong>Données</strong>.
            </div>
          )}

          {sheet && step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Feuille analysée : <strong>{sheet.name}</strong> · {sheet.rows.length} lignes ·{" "}
                {sheet.headers.length} colonnes.
              </p>
              <div className="rounded-lg border border-border p-4 bg-muted/30">
                <div className="text-xs uppercase text-muted-foreground tracking-wider mb-2">Colonnes détectées</div>
                <div className="flex flex-wrap gap-1.5">
                  {sheet.headers.map((h) => (
                    <span key={h} className="text-xs px-2 py-1 rounded bg-card border border-border">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <Button onClick={applyAutoDetect} variant="outline" className="gap-2">
                <Wand2 className="w-4 h-4" />
                Détection automatique des rôles
              </Button>
            </div>
          )}

          {sheet && step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sélectionnez les colonnes contenant les <strong>mesures numériques</strong> (sous-groupes pour
                SPC X̄-R, ou une seule colonne pour Capabilité / I-MR).
              </p>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                {headers.map((h) => (
                  <button
                    key={h}
                    onClick={() => toggleMeasure(h)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      draft.measureCols.includes(h)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border hover:bg-accent"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                {draft.measureCols.length} colonne(s) sélectionnée(s)
              </div>
            </div>
          )}

          {sheet && step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["partCol", "Pièce"],
                  ["operatorCol", "Opérateur"],
                  ["trialCol", "Essai"],
                  ["valueCol", "Valeur (mesure)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Select
                    value={(draft as any)[key] ?? "__none"}
                    onValueChange={(v) => setDraft({ ...draft, [key]: v === "__none" ? null : v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Aucun —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <p className="col-span-2 text-xs text-muted-foreground">
                Le mappage MSA est optionnel. Laissez vide si vos données ne contiennent pas d'étude R&R.
              </p>
            </div>
          )}

          {sheet && step === 3 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom du projet</Label>
                <Input
                  value={draftSpecs.projectName}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, projectName: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Unité</Label>
                <Input
                  value={draftSpecs.unit}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, unit: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">LSL (limite inférieure)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={draftSpecs.lsl}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, lsl: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">USL (limite supérieure)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={draftSpecs.usl}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, usl: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Cible (Target)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={draftSpecs.target}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, target: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Taille sous-groupe (2-10)</Label>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  value={draftSpecs.subgroupSize}
                  onChange={(e) => setDraftSpecs({ ...draftSpecs, subgroupSize: Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          {sheet && step === 4 && (
            <div className="space-y-3">
              <div className="text-sm">
                <strong>Récapitulatif</strong>
              </div>
              <div className="text-xs space-y-1 bg-muted/30 rounded-lg p-3 border border-border">
                <div>
                  <strong>Projet :</strong> {draftSpecs.projectName} · Unité {draftSpecs.unit}
                </div>
                <div>
                  <strong>Spécifications :</strong> LSL = {draftSpecs.lsl}, USL = {draftSpecs.usl}, Cible ={" "}
                  {draftSpecs.target}, n = {draftSpecs.subgroupSize}
                </div>
                <div>
                  <strong>Mesures (SPC) :</strong> {draft.measureCols.join(", ") || "—"}
                </div>
                <div>
                  <strong>MSA :</strong> Pièce={draft.partCol ?? "—"}, Opérateur={draft.operatorCol ?? "—"}, Essai=
                  {draft.trialCol ?? "—"}, Valeur={draft.valueCol ?? "—"}
                </div>
              </div>

              {validation.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-1">
                  {validation.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {e}
                    </div>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-1">
                  {validation.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-warning">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}
              {validation.ok && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Format valide. Vous pouvez lancer les analyses.
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex !justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Précédent
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!sheet} onClick={() => setStep(step + 1)} className="gap-1">
              Suivant <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!validation.ok} className="gap-1">
              <CheckCircle2 className="w-4 h-4" /> Valider et appliquer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
