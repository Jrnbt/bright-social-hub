import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Dossier, Task, Control } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AssistantProps {
  dossiers: Dossier[];
  tasks: Task[];
  controls: Control[];
}

export function Assistant({ dossiers, tasks, controls }: AssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis l'assistant IA de Bright Social Hub. Je peux vous aider a analyser vos dossiers, detecter des anomalies et repondre a vos questions sur la paie et la gestion sociale.\n\nExemples de questions :\n- \"Quels dossiers ont des taches en retard ?\"\n- \"Analyse les ecarts du dossier DUPONT sur la periode janvier-mars\"\n- \"Quels controles sont en anomalie ce mois-ci ?\"",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("claude-chat", {
        body: { message: text },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || data.error || "Pas de reponse",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Une erreur est survenue. Veuillez reessayer dans quelques instants.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Stats bar */}
      <div className="flex gap-3 mb-4">
        <div className="px-3 py-1.5 rounded-lg bg-info-light text-info text-[11px] font-extrabold">
          {dossiers.length} dossiers
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-warning-light text-warning text-[11px] font-extrabold">
          {tasks.filter((t) => t.status !== "done").length} taches actives
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-danger-light text-danger text-[11px] font-extrabold">
          {controls.filter((c) => c.status === "ko").length} anomalies
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-white border border-border rounded-lg p-4 space-y-4"
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-rose flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-4 py-3",
                msg.role === "user"
                  ? "bg-marine text-white"
                  : "bg-background text-foreground"
              )}
            >
              <div className="text-sm font-semibold whitespace-pre-wrap">
                {msg.content}
              </div>
              <div
                className={cn(
                  "text-[10px] mt-1",
                  msg.role === "user" ? "text-white/50" : "text-muted"
                )}
              >
                {new Date(msg.timestamp).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-marine flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-white" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-rose flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="bg-background rounded-lg px-4 py-3">
              <Loader2 size={16} className="animate-spin text-muted" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Posez votre question..."
          className="flex-1 px-4 py-3 rounded-lg border border-border text-sm font-semibold bg-white focus:outline-none focus:border-rose transition-colors"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-5 py-3 rounded-lg bg-rose text-white font-extrabold hover:bg-rose-hover transition-all disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
