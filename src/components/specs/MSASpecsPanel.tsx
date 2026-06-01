import { useAppStore, appActions } from "@/store/app-store";
import type { MSAProjectSpecs } from "@/store/app-store";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet } from "lucide-react";
import { detectSheet } from "@/lib/auto-detect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <div className="mt-1 [&_input]:h-8 [&_input]:text-sm">{children}</div>
  </div>
);

export const MSASpecsPanel = ({ showFilePicker }: { showFilePicker?: boolean } = {}) => {
  const specs = useAppStore((s) => s.msaProjectSpecs);
  const files = useAppStore((s) => s.files);
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const mapping = useAppStore((s) => s.mapping);

  const set = (key: keyof MSAProjectSpecs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    appActions.setMsaProjectSpecs({ [key]: e.target.value });

  // Mirror getSheetForKind("msa") logic: kind detection + column-mapping fallback
  const msaFiles = files.filter((f) => {
    if (f.uploadMode) return f.uploadMode === "msa";
    return f.sheets.some((sh) => {
      const k = detectSheet(sh).kind;
      if (k === "msa" || k === "msa-rr") return true;
      if (mapping.partCol && mapping.operatorCol) {
        return (
          sh.headers.includes(mapping.partCol) &&
          sh.headers.includes(mapping.operatorCol)
        );
      }
      return false;
    });
  });

  const activeFileName = activeFileIndex !== null ? files[activeFileIndex]?.name ?? null : null;

  const handleFileChange = (name: string) => {
    const idx = files.findIndex((f) => f.name === name);
    if (idx !== -1) appActions.setActiveFile(idx);
  };

  return (
    <SectionCard title="Spécifications du projet">
      {showFilePicker && msaFiles.length > 0 && (
        <div className="mb-4 pb-4 border-b border-border">
          <Label className="text-xs flex items-center gap-1.5 mb-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
            Fichier MSA actif
          </Label>
          <Select
            value={activeFileName && msaFiles.some((f) => f.name === activeFileName) ? activeFileName : (msaFiles[0]?.name ?? "")}
            onValueChange={handleFileChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sélectionner un fichier MSA" />
            </SelectTrigger>
            <SelectContent>
              {msaFiles.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  {f.name}
                  {f.name === activeFileName && (
                    <span className="ml-2 text-[10px] text-muted-foreground">(actif)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
