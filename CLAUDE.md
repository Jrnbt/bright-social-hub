# DIRECTIVES DE SECURITE - Bright Social Hub

> Fichier maintenu automatiquement par la session d'audit de securite.
> Derniere mise a jour : 2026-04-16
> Statut global : 6 CRITIQUES | 10 HAUTES | 16 MOYENNES

---

## REGLES OBLIGATOIRES

Avant tout commit ou modification de code, tu DOIS respecter ces directives de securite.
Ne jamais introduire de code qui contrevient a ces regles.
Les failles listees ci-dessous doivent etre corrigees en priorite absolue.

---

## CORRECTIONS CRITIQUES (priorite absolue)

### C1. XSS via document.write dans handleViewReport
- **Fichier** : `src/App.tsx` (fonction `handleViewReport`)
- **Probleme** : Les variables `report.dossierName`, `report.dossierNumero`, `ch.name`, `ch.detail` sont interpolees dans du HTML via concatenation puis injectees via `win.document.write()`. Zero sanitization.
- **Vecteur** : Un dossier nomme `<img src=x onerror=alert(document.cookie)>` execute du JS a l'ouverture du rapport.
- **Correction** : Remplacer `document.write` par un composant React (portail ou route). A defaut, echapper TOUTES les variables :
```typescript
function escapeHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
```

### C2. Timing attack sur verifyClaudeToken
- **Fichier** : `supabase/functions/_shared/auth.ts` (~ligne 40)
- **Probleme** : `token === expected` court-circuite au premier caractere different. Un attaquant peut deviner le token caractere par caractere en mesurant le temps de reponse.
- **Correction** :
```typescript
import { timingSafeEqual } from "https://deno.land/std/crypto/timing_safe_equal.ts";
const encoder = new TextEncoder();
const a = encoder.encode(token);
const b = encoder.encode(expected);
if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
```

### C3. RLS factice residuelle dans migration 001
- **Fichier** : `supabase/migrations/001_initial_schema.sql` (lignes 223-235)
- **Probleme** : Policies `USING (true) WITH CHECK (true)` sur 13 tables. La migration 002 les remplace, mais si 002 echoue partiellement, certaines tables restent ouvertes.
- **Correction** : Ajouter un test de verification post-migration :
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE polname LIKE '%_all') THEN
    RAISE EXCEPTION 'ALERTE: policies permissives encore presentes';
  END IF;
END $$;
```

### C4. SERVICE_ROLE_KEY utilise partout (bypass RLS complet)
- **Fichiers** : `claude-webhook/index.ts`, `silae-sync/index.ts`, `claude-chat/index.ts`, `relance-auto/index.ts`, `veille-sociale/index.ts`
- **Probleme** : Toutes les edge functions creent le client Supabase avec `SERVICE_ROLE_KEY`, contournant completement le RLS de la migration 002. Une faille dans n'importe quelle function = acces total a toutes les tables.
- **Correction** : Utiliser le JWT utilisateur pour les fonctions agissant au nom d'un utilisateur (claude-chat, missive-proxy, veille-sociale/list). Reserver SERVICE_ROLE_KEY aux operations backend pures (silae-sync, cron jobs).

### C5. claude-webhook read_table sans whitelist
- **Fichier** : `supabase/functions/claude-webhook/index.ts` (action `read_table`)
- **Probleme** : Accepte n'importe quel nom de table sans validation. Avec SERVICE_ROLE_KEY = exfiltration de toute la base.
- **Correction** :
```typescript
const readAllowed = ["dossiers","members","tasks","controls","reports","suivi_paie_months","suivi_paie_lines","app_config"];
if (!readAllowed.includes(body.table)) return errorResponse("Table non autorisee", cors, 403);
```

### C6. create_tasks_batch : injection d'ID et zero validation
- **Fichier** : `supabase/functions/claude-webhook/index.ts` (lignes 226-228)
- **Probleme** : Accepte un `id` fourni par le client (peut ecraser des taches existantes) et un `created_at` arbitraire. Le schema des taches n'est pas valide.
- **Correction** : Toujours generer cote serveur :
```typescript
const tasksWithIds = tasks.map((t) => ({
  ...validated(t), // valider champs autorises, types, longueurs
  id: crypto.randomUUID(),
  created_at: new Date().toISOString(),
}));
```

---

## CORRECTIONS HAUTES (a appliquer rapidement)

### H1. Proxies sans authentification
- **Fichiers** : `missive-proxy/index.ts`, `silae-proxy/index.ts`, `silae-sync/index.ts`
- **Probleme** : Aucune verification JWT/token. N'importe qui connaissant l'URL peut appeler les APIs Missive et Silae.
- **Correction** : Ajouter en debut de chaque fonction :
```typescript
const authHeader = req.headers.get("Authorization");
if (!authHeader) return errorResponse("Unauthorized", cors, 401);
const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
if (error || !user) return errorResponse("Unauthorized", cors, 401);
```

### H2. CORS wildcard ou trop permissif
- **Fichiers** : Toutes les edge functions
- **Probleme** : `Access-Control-Allow-Origin: *` ou origines trop larges permettent des attaques cross-origin.
- **Correction** : Restreindre au domaine de l'app uniquement :
```typescript
const corsHeaders = { "Access-Control-Allow-Origin": "https://bright-social-hub.lovable.app" };
```

### H3. Absence de rate limiting sur tous les endpoints
- **Fichiers** : Toutes les edge functions (7 fichiers)
- **Probleme** : Aucun rate limiting. Risques : couts API Anthropic explosifs via claude-chat, surcharge Silae, spam de taches.
- **Correction** : Implementer un compteur par IP/utilisateur dans une table Supabase ou en memoire.

### H4. Aucune limitation de cout sur l'appel Anthropic API
- **Fichier** : `supabase/functions/claude-chat/index.ts` (~lignes 152-168)
- **Probleme** : `max_tokens: 2048` sans plafond d'appels par utilisateur/jour. Un utilisateur malveillant peut generer des couts importants.
- **Correction** : Ajouter un compteur d'appels par utilisateur par jour. Journaliser les tokens consommes via `usage` dans la reponse Anthropic.

### H5. SSRF potentiel via trigger_silae_sync
- **Fichier** : `supabase/functions/claude-webhook/index.ts` (~lignes 292-298)
- **Probleme** : `fetch()` interne vers `${SB_URL}/functions/v1/silae-sync` passe le SERVICE_ROLE_KEY en Bearer. Si SB_URL est corrompue, la cle est envoyee a un tiers.
- **Correction** : Valider que `SB_URL` matche `https://*.supabase.co`. Idealement, appeler directement la logique de sync en import.

### H6. Operations Supabase fire-and-forget
- **Fichier** : `src/hooks/useSupabaseStore.ts` (lignes 76-90, 162, 193, 264-275)
- **Probleme** : `.then()` vides = erreurs silencieuses, divergence etat local/base.
- **Correction** :
```typescript
.then(({ error }) => { if (error) toast.error("Erreur de sauvegarde"); })
```

### H7. Race condition dans le diff d'etat
- **Fichier** : `src/hooks/useSupabaseStore.ts` (lignes 64-99)
- **Correction** : Utiliser `useReducer` ou une queue de mutations. Debouncer les appels Supabase.

### H8. Messages d'erreur techniques exposes
- **Fichiers** : `src/App.tsx` (lignes 482, 718)
- **Correction** : Remplacer `toast.error(\`Erreur: ${err.message}\`)` par un message generique. Logger le detail en `console.error`.

### H9. Validation des entrees absente sur les formulaires
- **Fichiers** : `src/App.tsx` (DossierModal, TaskModal), `src/pages/Dossiers.tsx`, `src/pages/Settings.tsx`
- **Correction** : Ajouter Zod pour la validation. SIRET = 14 chiffres. Borner les valeurs numeriques.

### H10. window.prompt() non sanitise
- **Fichier** : `src/pages/Controls.tsx` (~ligne 150)
- **Correction** : Remplacer `prompt()` par un modal React. Sanitiser avant stockage.

---

## CORRECTIONS MOYENNES

### M1. Politique RLS circulaire sur authorized_users
- **Fichier** : `supabase/migrations/002_security_hardening.sql` (lignes 13-16)
- **Correction** : Documenter la procedure de bootstrap admin. Ajouter un seed SQL.

### M2. Fonctions SECURITY DEFINER sans SET search_path
- **Fichier** : `supabase/migrations/002_security_hardening.sql` (lignes 19-26)
- **Correction** : Ajouter `SET search_path = public` a `is_authorized()` et `is_admin()`.

### M3. fix_data : patch non valide + format d'ID non verifie
- **Fichier** : `supabase/functions/claude-webhook/index.ts`
- **Correction** : Whitelist de champs modifiables par table. Valider format UUID de l'id.

### M4. Scope OAuth Silae hardcode en fallback
- **Fichier** : `supabase/functions/_shared/silae-auth.ts` (~ligne 24)
- **Correction** : Rendre `SILAE_SCOPE` obligatoire (erreur si non defini).

### M5. Erreurs Silae leakent le status code
- **Fichier** : `supabase/functions/_shared/silae-auth.ts`
- **Correction** : Separer message interne (log) du message client.

### M6. Pas de validation de la taille du body JSON
- **Fichiers** : Toutes les edge functions
- **Correction** : Verifier `Content-Length < 100_000` avant `req.json()`.

### M7. veille-sociale : XML externe sans validation de protocole
- **Fichier** : `supabase/functions/veille-sociale/index.ts`
- **Correction** : Valider que `source_url` commence par `https://`.

### M8. Generateur d'IDs previsible (frontend)
- **Fichier** : `src/lib/utils.ts`
- **Correction** : Remplacer `Date.now() + Math.random()` par `crypto.randomUUID()`.

### M9. Donnees PII non masquees (SIRET, dirigeant, adresse)
- **Fichiers** : `src/pages/Dossiers.tsx`, `src/lib/types.ts`
- **Correction** : Masquer partiellement les donnees sensibles dans l'affichage.

### M10. Faux test de connexion Silae
- **Fichier** : `src/pages/Settings.tsx`
- **Correction** : Implementer un vrai test qui appelle l'API et affiche le resultat reel.

### M11. Bouton "Actualiser" factice
- **Fichier** : `src/App.tsx`
- **Correction** : Implementer un vrai refetch des tables Supabase ou supprimer le bouton.

### M12. Encodage `|||` fragile (SIRET + dirigeant)
- **Fichier** : `src/App.tsx`
- **Correction** : Passer un objet structure `{ siret, dirigeant }` au lieu d'une chaine concatenee.

### M13. Subscriptions Realtime non filtrees
- **Fichier** : `src/hooks/useSupabaseStore.ts`
- **Correction** : Ajouter des filtres Realtime par utilisateur une fois l'auth en place.

### M14. Pas de validation du format `period` dans silae-sync
- **Fichier** : `supabase/functions/silae-sync/index.ts`
- **Correction** : Valider avec regex `/^\d{4}-(0[1-9]|1[0-2])$/`.

### M15. missive-proxy : injection de parametres dans l'URL
- **Fichier** : `supabase/functions/missive-proxy/index.ts`
- **Correction** : Utiliser `encodeURIComponent()`. Valider `box` dans une liste et `limit` comme entier positif borne.

### M16. silae-sync : appel redondant a fetchSalaries
- **Fichier** : `supabase/functions/silae-sync/index.ts` (~ligne 139)
- **Correction** : Reutiliser `salCurr` du scope parent au lieu de re-fetcher.

---

## REGLES POUR TOUT NOUVEAU CODE

1. **Jamais de `document.write`** ni de `innerHTML` avec des donnees dynamiques
2. **Jamais de `.then()` vide** sur les operations Supabase -- toujours gerer les erreurs
3. **Toujours valider les entrees** avant insertion en base (Zod recommande)
4. **Toujours verifier l'authentification** dans les edge functions (JWT ou token dedie)
5. **Jamais de CORS `*`** en production -- restreindre au domaine de l'app
6. **Utiliser `crypto.randomUUID()`** au lieu de `Date.now() + Math.random()` pour les IDs
7. **Ne jamais exposer** `err.message` brut a l'utilisateur -- message generique + console.error
8. **Toujours echapper** le HTML quand on interpole des variables dans du markup
9. **Jamais de SERVICE_ROLE_KEY** quand le JWT utilisateur suffit
10. **Toujours utiliser une comparaison en temps constant** pour les tokens/secrets
11. **Toujours generer les IDs cote serveur** -- ne jamais accepter un ID fourni par le client
12. **Toujours valider la taille du body** avant `req.json()` dans les edge functions
13. **Toujours valider le format des parametres** (period, table, id) avec des regex strictes
14. **Toujours ajouter `SET search_path = public`** aux fonctions SECURITY DEFINER
