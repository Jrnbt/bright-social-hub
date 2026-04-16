import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Article {
  id: string;
  title: string;
  summary: string;
  source: string;
  source_url: string;
  published_at: string;
  category: string;
  fetched_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  legislation: "Legislation",
  jurisprudence: "Jurisprudence",
  convention: "Convention",
  social: "Social",
  autre: "Autre",
};

const CATEGORY_COLORS: Record<string, string> = {
  legislation: "bg-info-light text-info",
  jurisprudence: "bg-warning-light text-warning",
  convention: "bg-success-light text-success",
  social: "bg-rose-light text-rose",
  autre: "bg-marine-light text-muted",
};

export function Actualites() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");

  const fetchArticles = useCallback(async () => {
    const { data } = await supabase
      .from("veille_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(50);
    if (data) setArticles(data);
  }, []);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const handleRefresh = async () => {
    setLoading(true);
    toast.info("Actualisation des sources...");
    try {
      const { error } = await supabase.functions.invoke("veille-sociale", {
        body: { action: "fetch" },
      });
      if (error) throw error;
      await fetchArticles();
      toast.success("Articles mis a jour");
    } catch (err: any) {
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filterCategory
    ? articles.filter((a) => a.category === filterCategory)
    : articles;

  const selectClass =
    "px-3 py-2 rounded-lg border border-border text-sm font-semibold bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select
          className={selectClass}
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="">Toutes categories</option>
          <option value="legislation">Legislation</option>
          <option value="social">Social / URSSAF</option>
          <option value="jurisprudence">Jurisprudence</option>
          <option value="convention">Conventions</option>
        </select>
        <div className="ml-auto">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Actualiser les sources
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📰</div>
          <h3 className="text-base font-extrabold text-marine">Aucun article</h3>
          <p className="text-sm text-muted font-semibold mt-1">
            Cliquez sur "Actualiser" pour charger les dernieres actualites
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((article) => (
            <div
              key={article.id}
              className="bg-white border border-border rounded-lg p-5 hover:shadow-md hover:border-rose/30 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "text-[11px] font-extrabold px-2 py-0.5 rounded",
                        CATEGORY_COLORS[article.category] ?? CATEGORY_COLORS.autre
                      )}
                    >
                      {CATEGORY_LABELS[article.category] ?? article.category}
                    </span>
                    <span className="text-[11px] font-bold text-muted">
                      {article.source}
                    </span>
                    <span className="text-[11px] text-muted">
                      {new Date(article.published_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <h4 className="text-sm font-extrabold text-marine leading-snug">
                    {article.title}
                  </h4>
                  {article.summary && (
                    <p className="text-xs text-muted font-semibold mt-1 line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                </div>
                {article.source_url && (
                  <a
                    href={article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-2 rounded hover:bg-background transition-colors text-muted hover:text-rose"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
