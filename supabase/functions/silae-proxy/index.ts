import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getCorsHeaders, corsResponse } from "../_shared/cors.ts";
import { verifyAuth, unauthorizedResponse } from "../_shared/auth.ts";
import { jsonResponse, errorResponse } from "../_shared/validate.ts";
import { silaePost } from "../_shared/silae-auth.ts";

const ACTIONS: Record<string, {
  endpoint: string;
  buildBody: (p: any) => Record<string, unknown>;
  validate: (p: any) => string | null;
}> = {
  lister_dossiers: {
    endpoint: "/v1/InfosTechniquesDossiers/ListeDossiers",
    buildBody: (p) => ({ typeDossiers: 0, ...(p?.etatDossier !== undefined ? { etatDossier: p.etatDossier } : {}) }),
    validate: () => null,
  },
  lister_salaries: {
    endpoint: "/v1/InfosSalaries/ListeSalaries",
    buildBody: (p) => ({
      numeroDossier: p.numeroDossier,
      listeSalariesOptions: p.dateReference ? { optionActifALaDate: p.dateReference } : {},
    }),
    validate: (p) => !p?.numeroDossier ? "numeroDossier requis" : null,
  },
  get_bulletin_entete: {
    endpoint: "/v1/InfosBulletins/SalarieBulletinEntete",
    buildBody: (p) => ({
      numeroDossier: p.numeroDossier,
      requeteSalarieBulletinEntete: {
        matriculeSalarie: p.matriculeSalarie,
        identifiantEmploi: p.identifiantEmploi,
        periode: p.periode,
        indicePeriode: 0,
      },
    }),
    validate: (p) => (!p?.numeroDossier || !p?.matriculeSalarie || !p?.periode) ? "numeroDossier, matriculeSalarie et periode requis" : null,
  },
  get_detail_cotisations: {
    endpoint: "/v1/InfosBulletins/SalarieBulletinDetails",
    buildBody: (p) => ({
      numeroDossier: p.numeroDossier,
      requeteSalarieBulletinDetails: {
        typeDetails: 3,
        matriculeSalarie: p.matriculeSalarie,
        identifiantEmploi: p.identifiantEmploi,
        periode: p.periode,
        indicePeriode: 0,
      },
      requeteSalarieBulletinFiltres: {},
    }),
    validate: (p) => (!p?.numeroDossier || !p?.matriculeSalarie || !p?.periode) ? "numeroDossier, matriculeSalarie et periode requis" : null,
  },
  lister_absences: {
    endpoint: "/v1/Absences/SalarieAbsences",
    buildBody: (p) => ({
      numeroDossier: p.numeroDossier,
      requeteSalarieAbsences: {
        matriculeSalarie: p.matriculeSalarie,
        periodeDebut: p.periodeDebut,
        periodeFin: p.periodeFin,
        optionFiltrage: 0,
      },
    }),
    validate: (p) => (!p?.numeroDossier || !p?.matriculeSalarie) ? "numeroDossier et matriculeSalarie requis" : null,
  },
};

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return corsResponse(req);

  const auth = await verifyAuth(req);
  if (!auth.ok) return unauthorizedResponse(cors);

  try {
    const { action, params } = await req.json();
    const route = ACTIONS[action];
    if (!route) return errorResponse("Action inconnue", cors, 400);

    const err = route.validate(params ?? {});
    if (err) return errorResponse(err, cors, 400);

    const data = await silaePost(route.endpoint, route.buildBody(params ?? {}));
    return jsonResponse(data, cors);
  } catch (e) {
    console.error("[silae-proxy]", e);
    return errorResponse("Erreur lors de l appel Silae", cors);
  }
});
