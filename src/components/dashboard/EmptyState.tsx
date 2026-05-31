import { Link } from "react-router-dom";
import { Database, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title?: string;
  message?: string;
  showImportButton?: boolean;
}

export const EmptyState = ({
  title = "Aucune donnée importée",
  message = "Importez vos fichiers Excel (SPC et/ou MSA) depuis l'onglet « Données ». Tous les calculs et diagrammes sont générés à partir de vos fichiers — aucune donnée statique n'est utilisée.",
  showImportButton = true,
}: Props) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-card rounded-xl border border-dashed border-border">
    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
      <Database className="w-8 h-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-md mb-5 leading-relaxed">{message}</p>
    {showImportButton && (
      <Button
        asChild
        size="sm"
        className="gap-2"
        onClick={() => {}}
      >
        <Link to="/data">
          <Upload className="w-4 h-4" />
          Importer des fichiers Excel
        </Link>
      </Button>
    )}
  </div>
);
