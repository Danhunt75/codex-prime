# Vérifications de l'intégration D1 — 19 novembre 2026

## Environnement et périmètre

Copie locale de `Danhunt75/codex-prime`, issue de `main` au commit `179741f54bbea66fcfa9ac3fe22d1adc23f7cea6`, branche locale `codex/commentaires-d1`. Node.js `24.21.0`, Wrangler `4.161.0` et dépendances du fichier verrouillé existant, sans mise à niveau.

Ces vérifications ont été effectuées localement avant la publication des changements dans une branche GitHub dédiée. Aucun déploiement, aucune migration D1 distante, aucune lecture des commentaires de production et aucune reprise R2 n'ont été exécutés pendant ces vérifications. Le statut des contrôles GitHub est à consulter sur la pull request.

## Contrôles réellement exécutés

- `npm ci --no-fund --no-audit` : installation réussie des dépendances verrouillées. Sous Windows, `NODE_OPTIONS=--use-system-ca` a permis d'utiliser les autorités de certification du système sans désactiver la vérification TLS.
- `npm test` : **15 tests réussis, 0 échec**. Dernière exécution : environ 13,5 secondes. D1 locale émulée par workerd, double R2 pour les tests de concurrence, puis test du Worker complet dans le runtime Workers local.
- `npm run db:migrate:local` : `0001_commentaires.sql` appliquée avec succès par Wrangler à la base **locale** ; table et index créés. Le test du runtime applique également la migration deux fois, avec des données présentes lors du second passage, pour vérifier qu'elle n'est pas rejouée.
- `npm run check` : compilation et paquet de déploiement réussis avec `--dry-run`. Les deux liaisons `DB` (D1) et `DATA` (R2) sont reconnues. Aucun envoi du paquet.
- `node --check` sur `outils-app.js`, `worker/src/commentaires.js` et `functions/api/[[path]].js` : syntaxe valide.
- `git diff --check` : aucun défaut d'espacement dans le diff.
- `node scripts/validate-d1-config.mjs` : refus attendu, code de sortie 1, car `database_id` contient encore `locazen`. Ce refus protège les commandes distantes prévues par les scripts et le workflow ; le dry-run local peut réussir avec cette valeur et ne prouve donc pas sa validité distante.

## Comportements couverts par les 15 tests

- Initialisation R2 sans écrasement, mise à jour de tous les champs, isolation des outils et conflits simultanés d'édition.
- Commentaires effectivement insérés dans une D1 locale ; aucune nouvelle écriture de commentaire R2. Auteur et date imposés par le serveur.
- Texte comportant apostrophes, fragment SQL et balises conservé comme texte, sans altérer la table.
- Pagination sur 45 commentaires en pages de 20 / 20 / 5, y compris 25 dates identiques ; aucun doublon ni oubli des données initiales. Un commentaire ajouté entre les pages n'en décale pas la suite et apparaît après rechargement de la première page.
- Curseur vide, invalide, trop long, date impossible, doublon de paramètre et curseur d'un autre outil refusés. Le proxy Pages transmet uniquement les curseurs autorisés et conserve le JWT sans relayer les cookies.
- Purge à 12 mois calendaires, conservation de la borne exacte, cas du 29 février, répétition sans effet supplémentaire et propagation des erreurs. Les objets R2 restent présents.
- Refus des corps invalides, textes trop longs, routes inconnues, origines étrangères, absence d'autorisation et échec Turnstile, sans ajout indu.
- Vérification cryptographique de JWT de test : signature, expiration, audience, émetteur et email. Tests Turnstile avec réponses simulées : succès, hostname et action.
- Worker complet exécuté localement : migration, lecture HTTP D1, refus d'écriture sans configuration Access et événement `scheduled` qui purge réellement la D1 locale sans retirer les objets R2.

Les lignes `Erreur API Error` dans la sortie des tests correspondent aux refus et à la panne de stockage volontairement simulés ; elles n'indiquent pas un échec de la suite.

## Ce qui reste à régler ou à vérifier

1. Remplacer `locazen` par le **véritable UUID de `projet-db`** dans `worker/wrangler.jsonc`. L'existence et l'identifiant de cette base n'ont pas été confirmés dans le compte Cloudflare. Le contrôle local n'en vérifie que le format.
2. Vérifier l'environnement GitHub `formation`, le secret `CLOUDFLARE_API_TOKEN` avec les droits D1 nécessaires et la variable `CLOUDFLARE_ACCOUNT_ID`. Ne jamais copier un secret dans Git ou dans le chat.
3. Vérifier dans Cloudflare les valeurs Access, Turnstile et d'origine décrites dans le README. Les services réels d'identité, le widget et les droits du jeton de déploiement n'ont pas été testés en production.
4. Relire et intégrer la pull request, puis appliquer la migration distante via le workflow avant le Worker et publier aussi la Pages Function ainsi que les fichiers du site. Contrôler les résultats des jobs GitHub Actions sur la pull request ; le job de déploiement distant reste distinct des tests.
5. Tester sur le site publié la création et la pagination des commentaires, les lignes D1, les refus d'écriture et la prochaine exécution du Cron Trigger. Le bouton dans un navigateur, la connexion Access réelle et le stockage distant restent à vérifier.
6. Décider séparément de la [reprise proposée](REPRISE_R2_D1.md). Sans cette reprise, les éventuels anciens commentaires R2 restent conservés dans R2 et ne sont pas affichés par la nouvelle API D1.
