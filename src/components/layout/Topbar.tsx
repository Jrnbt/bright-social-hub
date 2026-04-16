import { RefreshCw, Plus } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  onNewTask: () => void;
}

export function Topbar({ title, subtitle, onRefresh, onNewTask }: TopbarProps) {
  return (
    <header className="bg-white border-b border-border px-8 py-4 flex items-center justify-between sticky top-0 z-40">
      <div>
        <h2 className="text-xl font-black text-marine">{title}</h2>
        <p className="text-xs text-muted font-semibold">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-extrabold text-foreground hover:border-rose hover:text-rose transition-all"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
        <button
          onClick={onNewTask}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
        >
          <Plus size={14} />
          Nouvelle tâche
        </button>
      </div>
    </header>
  );
}
