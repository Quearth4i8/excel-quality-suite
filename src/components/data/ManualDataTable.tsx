import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appActions } from "@/store/app-store";
import type { ParsedFile, ParsedSheet } from "@/lib/excel";
import { Plus, Trash2, TableProperties } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DEFAULT_COLS = ["Col1", "Col2", "Col3"];
const DEFAULT_ROWS = 5;

function makeEmptyRows(nRows: number, nCols: number): string[][] {
  return Array.from({ length: nRows }, () => Array(nCols).fill(""));
}

export const ManualDataTable = ({ open, onOpenChange }: Props) => {
  const [tableName, setTableName] = useState("Tableau manuel");
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLS);
  const [rows, setRows] = useState<string[][]>(makeEmptyRows(DEFAULT_ROWS, DEFAULT_COLS.length));

  const reset = () => {
    setTableName("Tableau manuel");
    setColumns(DEFAULT_COLS);
    setRows(makeEmptyRows(DEFAULT_ROWS, DEFAULT_COLS.length));
  };

  // ── Column operations ──
  const addColumn = () => {
    const newName = `Col${columns.length + 1}`;
    setColumns((c) => [...c, newName]);
    setRows((r) => r.map((row) => [...row, ""]));
  };

  const removeColumn = (ci: number) => {
    if (columns.length <= 1) return;
    setColumns((c) => c.filter((_, i) => i !== ci));
    setRows((r) => r.map((row) => row.filter((_, i) => i !== ci)));
  };

  const renameColumn = (ci: number, value: string) => {
    setColumns((c) => c.map((col, i) => (i === ci ? value : col)));
  };

  // ── Row operations ──
  const addRow = () => {
    setRows((r) => [...r, Array(columns.length).fill("")]);
  };

  const removeRow = (ri: number) => {
    if (rows.length <= 1) return;
    setRows((r) => r.filter((_, i) => i !== ri));
  };

  const setCell = (ri: number, ci: number, value: string) => {
    setRows((r) => r.map((row, i) => (i === ri ? row.map((v, j) => (j === ci ? value : v)) : row)));
  };

  // ── Confirm ──
  const handleCreate = () => {
    const headers = columns.map((c) => c.trim() || `Col${columns.indexOf(c) + 1}`);
    const parsedRows = rows.map((row) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, ci) => {
        const raw = row[ci] ?? "";
        const num = Number(raw);
        obj[h] = raw === "" ? null : !isNaN(num) ? num : raw;
      });
      return obj;
    });

    const matrix: any[][] = [
      headers,
      ...rows.map((row) =>
        row.map((v) => {
          const num = Number(v);
          return v === "" ? null : !isNaN(num) ? num : v;
        })
      ),
    ];

    const sheet: ParsedSheet = { name: "Feuille1", headers, rows: parsedRows, matrix };
    const file: ParsedFile = {
      name: tableName.trim() || "Tableau manuel",
      sheets: [sheet],
      importedAt: new Date().toISOString(),
    };

    appActions.addFile(file);
    toast.success(`Tableau "${file.name}" créé`, {
      description: `${parsedRows.length} ligne(s) · ${headers.length} colonne(s)`,
    });
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <TableProperties className="w-5 h-5 text-primary" />
            Saisie manuelle de données
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2 border-b border-border">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs">Nom du tableau</Label>
              <Input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="Tableau manuel"
              />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              {rows.length} ligne(s) · {columns.length} colonne(s)
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 px-6 py-4">
          <table className="border-collapse w-max min-w-full">
            <thead>
              <tr>
                {/* Row number header */}
                <th className="w-10" />
                {columns.map((col, ci) => (
                  <th key={ci} className="px-1 pb-1 min-w-[120px]">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 text-xs font-semibold text-center"
                        value={col}
                        onChange={(e) => renameColumn(ci, e.target.value)}
                      />
                      <button
                        onClick={() => removeColumn(ci)}
                        disabled={columns.length <= 1}
                        className="text-muted-foreground hover:text-destructive disabled:opacity-30 shrink-0"
                        title="Supprimer la colonne"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
                {/* Add column */}
                <th className="px-1 pb-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={addColumn}>
                    <Plus className="w-3 h-3" />
                    Col
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="group">
                  {/* Row number */}
                  <td className="pr-2 text-xs text-muted-foreground text-right w-10 select-none">
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-1 py-0.5">
                      <Input
                        className="h-8 text-xs tabular-nums"
                        value={cell}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        placeholder="—"
                      />
                    </td>
                  ))}
                  {/* Remove row */}
                  <td className="px-1 py-0.5">
                    <button
                      onClick={() => removeRow(ri)}
                      disabled={rows.length <= 1}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive disabled:opacity-20 transition-opacity"
                      title="Supprimer la ligne"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-3 border-t border-border flex items-center justify-between gap-3">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
            <Plus className="w-3.5 h-3.5" />
            Ajouter une ligne
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>
              Annuler
            </Button>
            <Button onClick={handleCreate}>
              Créer le tableau
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
