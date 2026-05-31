import { useRef, useState } from "react";
import { streamChat } from "@/lib/ai";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Button } from "@/components/ui/button";
import { Sparkles, Square } from "lucide-react";

interface AIpanelProps {
  systemPrompt: string;
  userMessage: string;
  title?: string;
}

export const AIPanel = ({ systemPrompt, userMessage, title = "Interprétation IA" }: AIpanelProps) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    setText("");
    setError(null);
    setLoading(true);
    abortRef.current = new AbortController();
    try {
      for await (const chunk of streamChat(systemPrompt, userMessage, abortRef.current.signal)) {
        setText((prev) => prev + chunk);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(
        err.message?.toLowerCase().includes("fetch")
          ? "Ollama n'est pas démarré. Lancez Ollama puis exécutez : ollama run phi3.5"
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          {title}
        </span>
      }
      actions={
        loading ? (
          <Button size="sm" variant="outline" onClick={stop} className="gap-1.5 text-xs h-7">
            <Square className="w-3 h-3" />
            Arrêter
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={start}
            className="gap-1.5 text-xs h-7 bg-purple-600 hover:bg-purple-700 text-white border-0"
          >
            <Sparkles className="w-3 h-3" />
            {text ? "Relancer" : "Analyser avec l'IA"}
          </Button>
        )
      }
    >
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 border border-destructive/20">
          {error}
        </div>
      )}

      {!text && !loading && !error && (
        <p className="text-sm text-muted-foreground text-center py-3">
          Cliquez sur <strong>Analyser avec l'IA</strong> pour obtenir une interprétation de vos résultats.
        </p>
      )}

      {(text || loading) && (
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {text}
          {loading && (
            <span className="inline-block w-1.5 h-4 bg-purple-500 ml-0.5 animate-pulse rounded-sm align-middle" />
          )}
        </div>
      )}
    </SectionCard>
  );
};
