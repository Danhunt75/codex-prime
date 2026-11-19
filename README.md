# Codex Prime

Site HTML existant : https://codex-prime-crl.pages.dev/ — outils : https://codex-prime-crl.pages.dev/outils.html.

## État de l’exercice R2 et D1

Cette version prépare le passage des commentaires de R2 à D1. Les changements et les tests locaux ne prouvent pas le fonctionnement en production. Le véritable UUID de la base D1 reste à renseigner avant toute migration distante ou tout déploiement.

- Worker : `formation`, https://formation.75000dia.workers.dev.
- Bucket privé Standard : `formation-s4-donnees-codex-prime`, liaison `DATA`. Ne pas activer `r2.dev` ni de domaine public.
- 31 fiches avec identifiants stables `outil-001` à `outil-031`. Les champs de la source A (numéro, nom, URL, catégorie, usage) et B (nom, URL, étape, usage) sont conservés. La source et une date facultative de vérification sont éditables. Les dates des documents d’origine ne sont pas présentées comme une vérification réelle des services.
- `outils/<outilId>.json` : fiche, champs, version et date serveur.
- D1 `projet-db`, liaison `DB`, table `commentaires` : nouveaux commentaires. Colonnes `id`, `outil_id`, `texte`, `auteur`, `cree_le` ; index de lecture par outil/date/identifiant et index de purge par date. L'auteur est le libellé serveur `Propriétaire`, puisque l'écriture reste réservée au propriétaire. L'email Access n'est pas publié dans les commentaires.
- Les éventuels anciens objets `commentaires/<outilId>/<UUID>.json` restent intacts dans R2. Ils ne sont plus lus par cette API. La [proposition de reprise unique](REPRISE_R2_D1.md), sans doublons et sans suppression R2, attend un accord explicite.
- L’initialisation explicite crée seulement les fiches manquantes, avec une condition R2 atomique. Les rechargements ne réécrivent jamais la liste. Chaque mise à jour utilise une version et une condition d’ETag R2 pour refuser l’écrasement concurrent.

## Connexion personnelle avec Cloudflare Access

Seul le propriétaire autorisé peut modifier ou commenter. La consultation directe de l’API du Worker est publique ; les écritures exigent un JWT Access signé ET l’email autorisé, ainsi que Turnstile. CORS et Turnstile ne remplacent pas l’identité.

1. Pour un domaine `pages.dev`, suivre le mécanisme Pages : **Workers & Pages → codex-prime → Settings → General → Enable access policy**. Ouvrir **Manage** sur la règle créée pour les previews. Dans Access → Applications → Configure, retirer le wildcard `*` du sous-domaine afin de cibler exactement `codex-prime-crl.pages.dev` ; ajouter le chemin `api` afin de protéger `/api` et ses sous-chemins (y compris `/api/connexion`) tout en gardant l’accueil et le HTML publics. Renommer l’application si Cloudflare le demande. Réactiver ensuite la protection des previews dans Pages si souhaité : il s’agit d’une autre application. Vérifier les hostnames et chemins finaux dans le tableau de bord.
   Documentation officielle : https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain. Une simple activation de la protection des previews ne protège pas le domaine de production.
2. Ajouter une règle **Allow → Emails** avec uniquement sa propre adresse ; ne pas utiliser Everyone ni une règle Bypass. Activer la connexion par code email si aucun fournisseur d’identité n’est configuré.
3. Relever le domaine d’équipe (forme `nom.cloudflareaccess.com`) et l’Application Audience (AUD).
4. Dans le Worker **formation → Settings → Variables and secrets**, ajouter :
   - `ACCESS_TEAM_DOMAIN` : domaine d’équipe, sans `https://` ni barre finale ;
   - `ACCESS_AUD` : audience exacte de l’application ;
   - `EDITOR_EMAIL` : sa propre adresse autorisée, saisie directement dans Cloudflare ;
   - `TURNSTILE_SECRET_KEY` : **Secret**, déjà ajouté dans l’interface. Aucune valeur secrète dans Git ou le chat.
5. Dans le même tableau de bord, vérifier `ALLOWED_ORIGIN=https://codex-prime-crl.pages.dev`, `TURNSTILE_HOSTNAME=codex-prime-crl.pages.dev` et `TURNSTILE_ACTION=soumission`. `worker/wrangler.jsonc` remplace l'ancien TOML et conserve les liaisons `DATA` (R2) et `DB` (D1). `keep_vars: true` conserve les variables de l'interface lors des déploiements ; aucun secret n'est déclaré dans le code.
6. Le site utilise une **Pages Function** `functions/api/[[path]].js` qui relaie uniquement au Worker connu et transmet le JWT Access injecté par Cloudflare. Elle permet une session de même origine sans stocker de jeton dans le navigateur. Vérifier que Pages déploie réellement les Functions depuis la racine du dépôt ; un simple hébergement de fichiers sans Functions ne suffit pas.
7. Pour cette mise à jour, déployer d'abord le Worker avec la migration D1, puis publier le site et sa Pages Function qui transmet le curseur. Cliquer **Se connecter** sur `outils.html`, effectuer la connexion Access puis revenir à la liste. Sans configuration valide, l’API refuse l’écriture (503/401/403). Ne pas contourner ce refus pour terminer l’exercice. Coordonner les publications : une ancienne Pages Function ne transmet pas le curseur et une ancienne interface ne propose pas la pagination.

La clé publique du widget Managed est dans `outils-config.js`, liée au hostname `codex-prime-crl.pages.dev` et à l’action `soumission`. Chaque écriture consomme un jeton ; le widget est réinitialisé après un envoi.

## Déploiement depuis GitHub

Conserver la publication Pages reliée au dépôt. Après relecture et fusion vers `main`, le workflow manuel **Tester et déployer le Worker de formation** installe avec `npm ci`, exécute les tests et compile. Le job de déploiement vérifie l'UUID, exécute `wrangler d1 migrations apply projet-db --remote --config wrangler.jsonc`, puis déploie uniquement si la migration réussit. Les déploiements du Worker sont sérialisés. Les PR exécutent les contrôles sans déploiement. Les versions du fichier verrouillé sont conservées.

**Réglage D1 obligatoire :** `database_id` contient actuellement `locazen`, la valeur fournie. Cloudflare attend l'UUID réel de la base, pas son nom. Dans Cloudflare → **Storage & databases → D1 → projet-db**, copier son **Database ID** dans `worker/wrangler.jsonc`. Cet UUID n'est pas un secret. `npm run config:remote` bloque les scripts de migration distante et de déploiement tant que la valeur n'a pas la forme d'un UUID ; ce contrôle de format ne prouve pas l'existence de la base ni son appartenance au compte.

Créer l’environnement GitHub `formation`. Dans ses secrets/variables (ou au niveau dépôt) :

- Secret `CLOUDFLARE_API_TOKEN` : jeton limité au compte concerné, avec les droits nécessaires au déploiement du Worker, à R2 et à la modification D1 (`D1: Edit`). Le saisir directement dans GitHub Secrets, jamais dans le code ou le chat.
- Variable `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte.

Le jeton de déploiement reste chez Cloudflare et dans GitHub Secrets ; le secret Turnstile reste dans le Worker ; les fiches restent dans R2 privé et les nouveaux commentaires dans D1. Aucune clé S3 n'est nécessaire. Vérifier aussi la configuration de conservation des journaux et traces Cloudflare ; le cron des commentaires ne les gère pas.

## API des commentaires

- `POST /api/outils/outil-001/commentaires` : corps JSON `{ "texte": "Mon commentaire", "turnstileToken": "jeton-du-widget" }`. Access et Turnstile sont vérifiés avant toute écriture. Réponse `201` avec `id`, `outilId`, `texte`, `auteur`, `date` ; l'identifiant et la date UTC viennent du serveur.
- `GET /api/outils/outil-001/commentaires` : retourne `{ "commentaires": [...], "nextCursor": "...", "hasMore": true }`, au plus 20 commentaires, les plus récents d'abord. Les champs API `outilId` et `date` correspondent aux colonnes `outil_id` et `cree_le`.
- Suite : `GET /api/outils/outil-001/commentaires?cursor=<nextCursor encodé>`. À la fin, `nextCursor` vaut `null` et `hasMore` vaut `false`. Le bouton **Charger les commentaires précédents** utilise ce curseur dans `outils-app.js`.

Le tri est `cree_le DESC, id DESC` et le curseur contient les deux valeurs ainsi que l'outil. Aucun décalage `OFFSET` : un nouvel ajout entre deux pages ne décale pas les anciens résultats. Recharger la première page affiche les nouveaux commentaires. Les curseurs invalides, vides, dupliqués ou associés à un autre outil donnent `400`. Les outils inconnus donnent `404`. Les fiches doivent déjà être initialisées dans R2. Une panne D1 donne une erreur ; aucune écriture de secours dans R2.

Les valeurs passent toutes par des requêtes SQL fixes avec `prepare().bind()`, y compris les limites, curseurs et dates de purge. Aucun texte de commentaire n'est intégré au SQL. L'interface affiche les textes avec `textContent`.

## Purge quotidienne

Le Cron Trigger `15 3 * * *` appelle le handler `scheduled` chaque jour à **03:15 UTC**. Il supprime dans D1 uniquement les lignes dont `cree_le` est strictement antérieur à l'instant planifié moins **12 mois calendaires** ; le 29 février est ramené au 28 février si nécessaire. La ligne exactement à la limite est conservée. Jusqu'à la prochaine exécution réussie, un commentaire peut dépasser ce seuil. La purge attend la requête et laisse remonter ses erreurs ; son journal contient seulement le seuil et le nombre supprimé. R2 n'est jamais purgé par ce handler.

## Procédure de validation en production

1. Se connecter puis utiliser **Initialiser les fiches dans R2**. Répéter : aucune fiche existante ne doit être remplacée.
2. Modifier chaque champ d’un outil A (y compris nom, URL, numéro/catégorie ou étape, source et date facultative). Recharger depuis R2 : tout persiste, l’identifiant reste identique et B reste inchangé. Rechercher et filtrer.
3. Ajouter deux textes distincts à A, recharger puis vérifier leurs deux lignes dans D1 `commentaires`, avec `outil_id` de A et aucun ajout pour B. Vérifier la fiche `outils/<id de A>.json` dans R2 et l'absence de nouveaux objets commentaires dans R2. Sur un outil contenant plus de 20 commentaires, tester le bouton de pagination via le site Pages, sans répétition de page.
4. **Contrôles serveur → Tester les refus** : URL invalide, nom vide et commentaire vide donnent 400 ; écriture sans JWT donne 401/403. Les appels atteignent l’API, sans utiliser la validation HTML. L’outil compare les données avant/après. Contrôler aussi les objets directement dans R2.
5. Ouvrir la même fiche dans deux onglets. Enregistrer dans le premier, puis dans le second sans recharger : 409. La première écriture persiste. Ce refus utilise aussi une condition atomique R2, pas seulement une comparaison préalable.
6. Déconnexion Access : `/cdn-cgi/access/logout`. Une requête sans session doit être refusée. Tester une connexion avec une autre adresse : elle doit être refusée par la règle Access et par le Worker si un autre JWT lui parvient.
7. Vérifier dans Cloudflare la présence du Cron Trigger puis le résultat de sa prochaine exécution et les lignes D1 concernées. Conserver des preuves sans données personnelles. N'effacer aucun ancien commentaire R2 au titre de cette mise à jour. Un jeton conservé dans GitHub doit rester valide pour les futurs déploiements ; révoquer séparément tout jeton temporaire devenu inutile.

## Tests de développement

Dans `worker` : `npm ci`, `npm test`, `npm run check`. Ils peuvent tourner dans GitHub Actions. Pour développer avec une D1 persistante locale : `npm run db:migrate:local`, puis `npm run dev`. Ces commandes locales n'appliquent pas la migration distante. `npm run db:migrate:remote` exige au préalable le véritable UUID et l'authentification Cloudflare ; utiliser de préférence le workflow pour coordonner migration et déploiement.

Les tests API emploient une D1 locale émulée par workerd et un double R2 pour la concurrence ; un test d'intégration charge aussi le Worker complet, ses migrations, D1 et R2 dans le runtime Workers local. [Détail des vérifications et de leurs limites](VERIFICATIONS_D1.md). Aucune preuve de production n'est déduite de ces tests.

Références officielles : [liaisons et configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/), [requêtes préparées](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [Cron Triggers UTC](https://developers.cloudflare.com/workers/configuration/cron-triggers/) et [tests du runtime Workers](https://developers.cloudflare.com/workers/wrangler/api/).
