# TaleStudio

Une idée → un épisode animé de 60 s : script, personnages cohérents, vidéo, voix, lip-sync, sous-titres.
Monorepo TypeScript (pnpm + Turborepo). Le modèle économique et les choix d'infra suivent [`spec.md`](spec.md).

## Architecture

```
apps/
  web/        Next.js 16 (App Router) — landing, auth, dashboard, API REST, paiements CinetPay
  worker/     Worker Temporal — exécute le pipeline de génération (durable, retries, compensation)
packages/
  core/       Modèle de coûts, grille des TaleTokens, recharge, studios, rôles, schémas Zod
  blocks/     Moteur de blocs : registre versionné (entrées/sorties typées, config, fournisseurs, coût),
              workflows DAG par studio, validation, tri topologique, estimation avant exécution
  db/         Drizzle ORM + Postgres — schéma, migrations, ledger de TaleTokens atomique et idempotent
  ai/         Un adaptateur par étape : RodiumAI en priorité (Claude, image, vidéo, TTS, transcription),
              repli sur Anthropic / fal.ai / ElevenLabs si Rodium échoue ; lip-sync sur fal ; FFmpeg (rendu)
              — chacun avec un mock déterministe gratuit
  pipeline/   Activités idempotentes + orchestrateur unique (partagé Temporal / runner inline de dev)
  storage/    S3 : raw/ (expire 7–14 j via tags lifecycle) vs final/ (conservé, servi par CDN)
  ui/         Composants shadcn/ui (new-york) + tokens Tailwind v4
infra/
  docker-compose.yml   Postgres, Temporal + UI, S3 (LocalStack) avec les mêmes règles lifecycle que la prod
  terraform/           S3 + lifecycle + CloudFront (OAC, seuls les finals sont exposés)
```

### Modèle produit

```
Workspace (organization) ── membres (owner/admin/editor/viewer), invitations, portefeuille de TaleTokens, paiements CinetPay
  └─ Projet (studio: story | advertising | podcast | journalism)
       ├─ casting récurrent (portraits générés une fois, réutilisés)
       └─ Productions (épisodes / publicités) ── workflow épinglé `id@version`, block_run par bloc
```

### Pipeline d'une production (moteur de blocs)

```
STORYBOARD   script ─▶ cast ─▶ keyframes                       (100 TT + 13 TT/plan, réservés à la création)
                     ▲ édition d'un plan + redessin (15 TT) ▼
             ─── validation par l'utilisateur ───               (tokens de production réservés ici,
PRODUCTION   animate ┐                                            calculés sur le script réel)
             voice ──┴─▶ lipsync ─▶ render ×formats (16:9, 9:16, 1:1 — sans token supplémentaire)
             échec d'un bloc ─▶ remboursement de l'étape ─▶ « Relancer » ne repaie pas le travail fait
```

- **Workflows déclaratifs** (`packages/blocks/src/workflows.ts`) : graphe validé (ports, cycles, étapes),
  niveaux exécutés en parallèle (voix ∥ animation). Un épisode reste épinglé à sa version de workflow.
- **Un seul exécuteur** (`packages/pipeline/src/orchestrate.ts`) pour Temporal (prod) et le mode inline (dev).
- **Idempotence** : chaque item de bloc vérifie son asset avant d'appeler un fournisseur.

### Les quatre studios

| Studio | Workflow | Particularités |
|---|---|---|
| Story | `story-episode@1` | Bible de série, casting récurrent, continuité entre épisodes |
| Advertising | `ad-creative@1` | Brief de marque, accroche → produit → CTA, 15/30/45 s, export 9:16 · 1:1 · 16:9 |
| Podcast | `podcast-episode@1` | Épisode vidéo avec animateurs récurrents |
| Podcast | `podcast-clips@1` | **Podcast to Clips** : upload direct (URL signée, `private/`), transcription Whisper, moments forts (Claude), l'utilisateur choisit, clips 9:16 sous-titrés lus en HTTP range depuis S3. Prix sur la durée ; une durée sous-déclarée échoue et rembourse |
| Journalism | `news-report@1` | Vérification des **sources fournies uniquement** (citation exacte exigée, sinon « non vérifié » — garde-fou côté code), script limité aux faits vérifiés, **validation éditoriale obligatoire** avant production |

Le rendu utilise le binaire `ffmpeg-static` : en mode mock, les images clés sont de vrais JPEG, donc
le montage MP4, les sous-titres, les formats et les clips sont réellement produits en dev et en CI.

Invitations : e-mail envoyé via Resend si `RESEND_API_KEY` est défini, sinon lien à copier.

## Décisions clés

| Sujet | Décision | Pourquoi |
|---|---|---|
| Langage | TypeScript partout | Un seul toolchain, types partagés web ↔ worker ↔ DB |
| Orchestration | Temporal (spec) + runner inline en dev | Workflows longs (minutes), retries, compensation, annulation |
| GPU | Routeur d'API RodiumAI (une clé, un portefeuille RODI), repli fal.ai ; modèles surchargeables par env | Spec : payer à la seconde, pas de H100 dédiés au départ |
| Script | Claude Opus 5.5, sortie structurée Zod, fallback serveur en cas de refus | Plans valides garantis ; un refus ne casse pas l'épisode |
| Auth | Better Auth (Drizzle) | Self-hosted, pas de coût par MAU (vs Auth0 à 1M users) |
| Multi-tenant | Workspace = locataire ; accès uniquement via `member` ; rôles vérifiés côté API | Isolation stricte, portefeuille partagé par équipe |
| Architecture | Monolithe modulaire + workers | Contrats entre modules d'abord ; extraction en services quand la charge le justifie |
| Style | Tokens « white concrete, single ember » (Inter, 12 px, sans ombres, #ff5900 pour l'action principale) | Interface d'instrument de précision |
| Facturation | Portefeuille prépayé, recharge libre via CinetPay ; tokens crédités **uniquement** après `/payment/check` ACCEPTED, idempotent par transaction | Une notification seule ne crédite jamais ; pas de double crédit |
| Gratuit | Aucun plan gratuit : 50 TT de bienvenue, sous le prix d'un storyboard | Aucune génération offerte |
| Stockage | `raw/` taggé `retention=7|14` + lifecycle S3, `final/` en Intelligent-Tiering | Spec : ne garder que le rendu final |
| TaleTokens | Ledger append-only + solde dénormalisé, débit atomique `WHERE credits >= n`, `CHECK (credits >= 0)` | Pas de solde négatif même sous concurrence |

## TaleStudio Characters

Des personnages persistants, rattachés au **workspace** (pas à un projet) et réutilisables dans toutes les productions.
Deux types : personnage d'histoire (évolue) et identité virtuelle (persona : visage, voix et personnalité verrouillés).
Personnages **fictifs uniquement** : les visages sont générés, jamais importés de photos de personnes réelles.

- Fiche : ADN visuel, personnalité, histoire, voix fixe (archétype + interprétation), style.
- Visage : 4 propositions (60 TT) → choix du visage principal. Pack d'identité (150 TT) : 6 angles + 4 expressions,
  chacun comparé au visage principal par Claude et approuvé automatiquement s'il lui ressemble. Tenue ou expression : 15 TT.
- Verrouillage = nouvelle version (instantané comparable). Duplication et export JSON gratuits.
- Mémoire : un événement est ajouté à chaque production terminée ; le scénariste reçoit personnalité et mémoire.
- En production : les personnages choisis rejoignent la distribution du projet avec leur visage principal (aucun nouveau
  portrait), chaque image clé reçoit leurs meilleures références approuvées, est vérifiée (« ressemblance faible »
  signalée sur l'image), et la voix reste celle du personnage.
- Code : `packages/core/src/characters.ts`, `apps/web/lib/characters.ts`, jobs `generateCharacterJob` (pipeline).

## Économie unitaire : portefeuille de TaleTokens

Pas d'abonnement, pas de plan gratuit : chaque espace de travail a un portefeuille prépayé de **TaleTokens (TT)**,
rechargé du montant de son choix (dès 2 000 FCFA) via **CinetPay** (Mobile Money, carte). 50 TT sont offerts à
l'inscription (moins qu'un storyboard : toute production est payée). Les tokens n'expirent pas.

Convention publique : 1 $ ≈ 100 TT. On vend 1 TT = 6 FCFA (600 FCFA/$ contre ~565 au marché) : l'écart couvre les
frais CinetPay et le change. Rodium facture en RODI = FCFA, donc la route principale n'a aucun risque de change.

| Opération | Prix |
|---|---|
| Storyboard (script, portraits ≤ 6, images) | 100 TT + 13 TT / plan |
| Clip vidéo de 5 s | 40 TT |
| Plan parlé (voix + lip-sync) | 25 TT |
| Redessiner une image | 15 TT |
| Transcription | 30 TT / 10 min entamées |
| Détection des moments forts | 40 TT |
| Export d'un clip vertical | 10 TT |
| Fact-check | 100 TT |
| Rendu, sous-titres, formats supplémentaires | inclus |

Marges brutes (frais de paiement de 4 % déduits, 6 portraits comptés à chaque fois) :

| Production | Prix | Rodium prévu | Rodium au pire | Repli direct au pire |
|---|---|---|---|---|
| Épisode 30 s | 493 TT | 61 % | 51 % | 41 % |
| Épisode 60 s | 886 TT | 63 % | 55 % | 40 % |
| Épisode 180 s | 2 458 TT | 65 % | 57 % | 39 % |
| Reportage 60 s | 1 136 TT | 69 % | 60 % | 50 % |
| Podcast 30 min → 6 clips | 190 TT | 68 % | 52 % | 57 % |

Garde-fous (`packages/blocks/src/economics.test.ts`) : chaque étape réservable de chaque workflow, sur toutes les
durées, proportions de plans parlés et formats, doit garder ≥ 45 % de marge aux prix Rodium prévus, ≥ 25 % au pire,
et rester bénéficiaire si tout bascule sur les fournisseurs directs au pire prix. La CI échoue sinon.

Échec ou annulation d'une étape : les tokens réservés sont rendus **moins le coût réel (au prix coûtant) de ce qui a
déjà été généré**. Ces éléments sont conservés ; une relance ne facture que la différence (`keptByEarlierAttempts`),
donc le client ne paie jamais deux fois et nous ne payons jamais un travail non facturé.

`episode.cost_usd` accumule le coût réel provider par épisode pour suivre la marge réelle.

## Démarrer en local

Prérequis : Node 22+, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env          # puis BETTER_AUTH_SECRET=$(openssl rand -base64 32)
pnpm infra:up                 # Postgres, Temporal (UI : http://localhost:8233), S3 LocalStack
pnpm db:migrate
pnpm dev                      # web http://localhost:3000 + worker Temporal
```

Par défaut `AI_PROVIDERS=mock` : tout le produit fonctionne sans clé API (images SVG, animatic dans l'UI ;
le MP4 final n'est rendu qu'avec de vrais clips). Passer en réel étape par étape :

```bash
AI_SCRIPT=live RODIUM_API_KEY=...           # seulement le script en réel, via Rodium
AI_PROVIDERS=live RODIUM_API_KEY=... FAL_KEY=...   # tout via Rodium, fal pour le lip-sync
AI_PROVIDERS=live RODIUM_API_KEY=... FAL_KEY=... ELEVENLABS_API_KEY=... ANTHROPIC_API_KEY=...  # + repli complet
```

Avec `RODIUM_API_KEY`, chaque étape passe d'abord par Rodium. Si Rodium ne répond pas, renvoie une erreur
(5xx, maintenance, 429, timeout, fonctionnalité non relayée) ou un solde RODI insuffisant (402), l'appel est
rejoué une fois sur le fournisseur direct, à condition que sa clé soit renseignée. Le lip-sync n'a pas
d'équivalent sur Rodium et reste sur fal.

Port 5432 déjà pris ? `PG_PORT=5433` dans `.env` et ajustez `DATABASE_URL`.

CinetPay : renseignez `CINETPAY_API_KEY`, `CINETPAY_SITE_ID` et `CINETPAY_SECRET_KEY`. En local, la notification
n'atteint pas `localhost` : la page de retour `/api/payments/cinetpay/return` vérifie et crédite elle-même le paiement.

## Scripts

| Commande | Effet |
|---|---|
| `pnpm dev` | web + worker en watch |
| `pnpm typecheck` / `pnpm test` / `pnpm build` | via Turborepo |
| `pnpm db:generate` / `pnpm db:migrate` | migrations Drizzle |
| `pnpm --filter @talestudio/worker run-local <episodeId>` | rejoue un épisode sans Temporal (debug) |

## Production

- **web** : `apps/web/Dockerfile` (ou Vercel). **worker** : `apps/worker/Dockerfile` (FFmpeg inclus) sur ECS/Fargate,
  scale horizontal sur la profondeur de la task queue. Temporal Cloud via `TEMPORAL_API_KEY`.
- **Stockage** : `infra/terraform/storage.tf` → `CDN_BASE_URL` = output `cdn_base_url`.
- **DB** : Postgres managé (RDS Multi-AZ / Supabase) ; `DB_POOL_MAX` à ajuster par instance.

## API

| Méthode | Route | |
|---|---|---|
| `POST` | `/api/episodes` | Crée un épisode `{title, premise, style?, durationSec?, language?, mode: "storyboard"\|"full"}` — 402 si solde insuffisant, 429 si trop de jobs simultanés |
| `GET` | `/api/episodes` · `/api/episodes/:id` | Liste · détail + URLs signées (polling) |
| `POST` | `/api/episodes/:id/cancel` | Annule le workflow ; les tokens sont rendus, hors coût de ce qui a déjà été généré |
| `POST` | `/api/wallet/topup` | Recharge `{amountXof}` → URL de paiement CinetPay |
| `GET` `POST` | `/api/payments/cinetpay/notify` | Notification CinetPay (HMAC `x-token`), statut vérifié par `/payment/check` |
| `GET` `POST` | `/api/payments/cinetpay/return` | Retour client : vérifie, crédite, redirige vers le portefeuille |
| `POST` | `/api/episodes/:id/retry` | Relance une production en échec ou annulée, en ne facturant que ce qui manque |
| `GET` `POST` | `/api/characters` | Liste · création d'une fiche (gratuit) |
| `GET` `PATCH` `DELETE` | `/api/characters/:id` | Profil complet · modification (identité figée si verrouillé) · suppression |
| `POST` | `/api/characters/:id/generate` | `{kind: "candidates"\|"pack"\|"extra", extra?}` — génération payante en arrière-plan |
| `POST` `DELETE` | `/api/characters/:id/lock` | Verrouiller (nouvelle version) · déverrouiller |
| `PATCH` `DELETE` | `/api/characters/:id/references/:refId` | `{approved}` ou `{master: true}` · suppression |
| `POST` | `/api/characters/:id/duplicate` · `/notes` | Dupliquer · ajouter à la mémoire |
| `GET` | `/api/characters/:id/export` | Export JSON |
