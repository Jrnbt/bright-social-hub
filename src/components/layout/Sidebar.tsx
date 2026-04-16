import { cn } from "@/lib/utils";
import type { PageId } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Table2,
  Search,
  Building2,
  FileText,
  Settings,
  Newspaper,
  Bot,
  LogOut,
} from "lucide-react";

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  section: string;
  badge?: number;
}

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  taskCount: number;
}

export function Sidebar({ activePage, onNavigate, taskCount }: SidebarProps) {
  const navSections: { title: string; items: NavItem[] }[] = [
    {
      title: "Principal",
      items: [
        {
          id: "dashboard",
          label: "Tableau de bord",
          icon: <LayoutDashboard size={18} />,
          section: "principal",
        },
      ],
    },
    {
      title: "Tâches",
      items: [
        {
          id: "tasks",
          label: "Mes tâches",
          icon: <ClipboardList size={18} />,
          section: "taches",
          badge: taskCount,
        },
        {
          id: "team",
          label: "Vue équipe",
          icon: <Users size={18} />,
          section: "taches",
        },
      ],
    },
    {
      title: "Suivi Paies",
      items: [
        {
          id: "suivi-paies",
          label: "Suivi des paies",
          icon: <Table2 size={18} />,
          section: "suivi",
        },
      ],
    },
    {
      title: "Contrôles",
      items: [
        {
          id: "controls",
          label: "Contrôles mensuels",
          icon: <Search size={18} />,
          section: "controles",
        },
        {
          id: "dossiers",
          label: "Dossiers",
          icon: <Building2 size={18} />,
          section: "controles",
        },
        {
          id: "reports",
          label: "Rapports",
          icon: <FileText size={18} />,
          section: "controles",
        },
      ],
    },
    {
      title: "Informations",
      items: [
        {
          id: "actualites",
          label: "Actualites",
          icon: <Newspaper size={18} />,
          section: "infos",
        },
        {
          id: "assistant",
          label: "Assistant IA",
          icon: <Bot size={18} />,
          section: "infos",
        },
      ],
    },
    {
      title: "Configuration",
      items: [
        {
          id: "settings",
          label: "Paramètres",
          icon: <Settings size={18} />,
          section: "config",
        },
      ],
    },
  ];

  return (
    <aside className="w-[260px] bg-marine text-white flex flex-col fixed top-0 left-0 bottom-0 z-50">
      <div className="px-5 py-6 border-b border-white/[0.08]">
        <h1 className="text-xl font-black tracking-tight">
          Bright <span className="text-rose">Social Hub</span>
        </h1>
        <p className="text-[11px] text-white/50 font-semibold mt-1">
          Gestion Sociale — Bright Conseil
        </p>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.title} className="mb-6">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/35 px-2 mb-2">
              {section.title}
            </div>
            {section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-bold transition-all",
                  activePage === item.id
                    ? "bg-rose text-white"
                    : "text-white/70 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                <span className="w-6 flex justify-center">{item.icon}</span>
                {item.label}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={cn(
                      "ml-auto px-2 py-0.5 rounded-full text-[11px] font-extrabold",
                      activePage === item.id
                        ? "bg-white/25"
                        : "bg-white/15"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-white/[0.08]">
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 text-[11px] font-bold text-white/40 hover:text-rose transition-colors w-full"
        >
          <LogOut size={14} /> Deconnexion
        </button>
        <p className="text-[11px] text-white/30 mt-2">
          Bright Social Hub v1.0 — &copy; 2026
        </p>
      </div>
    </aside>
  );
}
