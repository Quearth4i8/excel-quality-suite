import { useAppStore, appActions } from "@/store/app-store";
import type { MSAProjectSpecs } from "@/store/app-store";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="mt-1 [&_input]:h-8 [&_input]:text-sm">{children}</div>
  </div>
);

export const MSASpecsPanel = () => {
  const specs = useAppStore((s) => s.msaProjectSpecs);

  const set = (key: keyof MSAProjectSpecs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    appActions.setMsaProjectSpecs({ [key]: e.target.value });

  return (
    <SectionCard title="Spécifications du projet">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Équipement">
          <Input value={specs.equipment} onChange={set("equipment")} placeholder="—" />
        </Field>
        <Field label="Référence">
          <Input value={specs.reference} onChange={set("reference")} placeholder="—" />
        </Field>
        <Field label="Pièce">
          <Input value={specs.piece} onChange={set("piece")} placeholder="—" />
        </Field>
        <Field label="Caractéristiques">
          <Input value={specs.characteristics} onChange={set("characteristics")} placeholder="—" />
        </Field>
        <Field label="Résolution">
          <div className="flex gap-1.5">
            <Input
              type="number"
              value={specs.resolutionVal}
              onChange={set("resolutionVal")}
              placeholder="0.001"
              className="flex-1 min-w-0"
            />
            <Input
              value={specs.resolutionUnit}
              onChange={set("resolutionUnit")}
              className="w-16"
              placeholder="mm"
            />
          </div>
        </Field>
        <Field label="Cible">
          <Input type="number" value={specs.target} onChange={set("target")} placeholder="—" />
        </Field>
        <Field label="Tolérance inférieure">
          <Input type="number" value={specs.toleranceInf} onChange={set("toleranceInf")} placeholder="—" />
        </Field>
        <Field label="Tolérance supérieure">
          <Input type="number" value={specs.toleranceSup} onChange={set("toleranceSup")} placeholder="—" />
        </Field>
      </div>
    </SectionCard>
  );
};
