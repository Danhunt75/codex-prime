# Codex Prime

Site HTML existant : https://codex-prime-crl.pages.dev/ — outils : https://codex-prime-crl.pages.dev/outils.html.

## État de l’exercice R2

Le code est préparé dans `exercice-r2-outils`. Une préparation locale ou une PR ne prouve pas le stockage en production. L’intégration cloud doit encore être déployée et vérifiée dans le compte.

- Worker : `formation`, https://formation.75000dia.workers.dev.
- Bucket privé Standard : `formation-s4-donnees-codex-prime`, liaison `DATA`. Ne pas activer `r2.dev` ni de domaine public.
- 31 fiches avec identifiants stables `outil-001` à `outil-031`. Les champs de la source A (numéro, nom, URL, catégorie, usage) et B (nom, URL, étape, usage) sont conservés. La source et une date facultative de vérification sont éditables. Les dates des documents d’origine ne sont pas présentées comme une vérification réelle des services.
- `outils/<outilId>.json` : fiche, champs, version et date serveur.
- `commentaires/<outilId>/<UUID>.json` : commentaire, identifiants et date serveur.
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
5. `ALLOWED_ORIGIN`, `TURNSTILE_HOSTNAME`, `TURNSTILE_ACTION` et la liaison `DATA` sont dans `worker/wrangler.toml`. `keep_vars = true` conserve les variables de l’interface lors des déploiements ; les secrets ne sont pas déclarés en clair.
6. Le site utilise une **Pages Function** `functions/api/[[path]].js` qui relaie uniquement au Worker connu et transmet le JWT Access injecté par Cloudflare. Elle permet une session de même origine sans stocker de jeton dans le navigateur. Vérifier que Pages déploie réellement les Functions depuis la racine du dépôt ; un simple hébergement de fichiers sans Functions ne suffit pas.
7. Déployer le site puis le Worker ; cliquer **Se connecter** sur `outils.html`, effectuer la connexion Access puis revenir à la liste. Sans configuration valide, l’API refuse l’écriture (503/401/403). Ne pas contourner ce refus pour terminer l’exercice.

La clé publique du widget Managed est dans `outils-config.js`, liée au hostname `codex-prime-crl.pages.dev` et à l’action `soumission`. Chaque écriture consomme un jeton ; le widget est réinitialisé après un envoi.

## Déploiement depuis GitHub

Conserver la publication Pages reliée au dépôt. Après relecture et fusion vers `main`, le workflow manuel **Tester et déployer le Worker de formation** installe avec `npm ci`, exécute les tests et compile avant déploiement. Les PR exécutent les contrôles sans déploiement. Les fichiers verrouillés sont versionnés.

Créer l’environnement GitHub `formation`. Dans ses secrets/variables (ou au niveau dépôt) :

- Secret `CLOUDFLARE_API_TOKEN` : jeton limité aux droits nécessaires au déploiement du Worker et à sa liaison R2, saisi directement dans GitHub.
- Variable `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte.

Le jeton de déploiement reste chez Cloudflare et dans GitHub Secrets ; le secret Turnstile reste dans le Worker et le gestionnaire de mots de passe ; les fiches et commentaires restent dans R2 privé. Aucune clé S3 n’est nécessaire.

## Procédure de validation en production

1. Se connecter puis utiliser **Initialiser les fiches dans R2**. Répéter : aucune fiche existante ne doit être remplacée.
2. Modifier chaque champ d’un outil A (y compris nom, URL, numéro/catégorie ou étape, source et date facultative). Recharger depuis R2 : tout persiste, l’identifiant reste identique et B reste inchangé. Rechercher et filtrer.
3. Ajouter deux textes distincts à A, recharger puis vérifier deux objets sous `commentaires/<id de A>/`, aucun sous B. Vérifier la fiche `outils/<id de A>.json` dans R2.
4. **Contrôles serveur → Tester les refus** : URL invalide, nom vide et commentaire vide donnent 400 ; écriture sans JWT donne 401/403. Les appels atteignent l’API, sans utiliser la validation HTML. L’outil compare les données avant/après. Contrôler aussi les objets directement dans R2.
5. Ouvrir la même fiche dans deux onglets. Enregistrer dans le premier, puis dans le second sans recharger : 409. La première écriture persiste. Ce refus utilise aussi une condition atomique R2, pas seulement une comparaison préalable.
6. Déconnexion Access : `/cdn-cgi/access/logout`. Une requête sans session doit être refusée. Tester une connexion avec une autre adresse : elle doit être refusée par la règle Access et par le Worker si un autre JWT lui parvient.
7. Conserver des preuves sans données personnelles ; nettoyer les commentaires fictifs inutiles depuis R2, vérifier la consommation puis révoquer le jeton Cloudflare temporaire avant de supprimer sa copie GitHub.

## Tests de développement

Dans `worker` : `npm ci`, `npm test`, `npm run check`. Ils peuvent tourner dans GitHub Actions, sans terminal local étudiant. Tests API avec R2 simulé : persistance, tous les champs, pagination, initialisation idempotente, commentaires distincts, refus sans mutation, concurrence simultanée, JWT cryptographique et Turnstile. Ces tests ne prouvent pas l’accès au bucket de production : les étapes ci-dessus restent nécessaires.
