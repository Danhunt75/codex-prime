# Proposition de reprise unique R2 → D1 — EN ATTENTE D'ACCORD

**Cette reprise n'est ni exécutée, ni branchée au déploiement, ni exposée par une route API.** Le code antérieur enregistrait des commentaires dans R2 ; leur présence réelle en production n'a pas été vérifiée. Le déploiement D1 n'importe aucun historique : les anciens commentaires R2 ne seront visibles dans la nouvelle API qu'après une reprise approuvée.

## Périmètre proposé

Après accord explicite, lire uniquement `commentaires/<outilId>/<UUID>.json` dans le bucket privé `formation-s4-donnees-codex-prime`. Conserver intégralement ces objets R2. N'utiliser aucune commande de suppression, déplacement, modification de métadonnées ou réécriture R2. Les fiches `outils/` restent dans R2.

1. Faire un inventaire paginé et un manifeste local protégé : clé, UUID, outil, ETag, empreinte du contenu, date et résultat. Geler brièvement l'ancienne écriture R2 pendant cet inventaire ou établir un point de coupure, afin de ne pas oublier une écriture tardive. Les nouveaux commentaires D1 peuvent continuer pendant la reprise.
2. Vérifier que chaque clé et chaque contenu ont le même UUID et outil connu. Valider le texte et convertir la date historique en ISO UTC avec millisecondes, sans changer sa valeur temporelle. L'ancien format ne contient pas d'auteur : employer `Auteur non renseigné (R2)`, sans inventer d'identité. Isoler les erreurs et collisions dans le rapport ; ne jamais les corriger silencieusement.
3. Présenter un aperçu des comptes par outil : valides, déjà présents, conflits, invalides et commentaires déjà âgés de plus de 12 mois. Proposer d'exclure ces derniers, puisque le cron les supprimerait de D1 ; R2 conserve la source dans tous les cas. Faire valider cet aperçu et le périmètre avant toute écriture de reprise.
4. Reprendre l'UUID historique comme `commentaires.id`, qui est unique. Employer exclusivement une requête fixe `INSERT INTO commentaires (id, outil_id, texte, auteur, cree_le) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING` avec `prepare().bind()` et des lots D1 bornés. Aucune valeur issue de R2 ne doit être concaténée dans du SQL.
5. Pour chaque UUID déjà présent ou ignoré par le conflit, relire avec `prepare().bind()` et comparer tous les champs normalisés. Si les contenus diffèrent, arrêter ce lot et signaler le conflit : ne rien écraser. Ne pas dédupliquer par texte, car deux commentaires distincts peuvent avoir le même texte.
6. Comparer les comptes, UUID, dates, auteurs et empreintes par outil, vérifier la pagination, puis clôturer le manifeste de cette opération unique. Garder le rapport hors du dépôt s'il contient des données personnelles.

## Reprise après interruption

Réutiliser le même manifeste et les mêmes UUID, sans générer de nouveaux identifiants. La clé primaire empêche les doublons même si un lot est relancé après une réponse perdue. Vérifier les ETags et les contenus avant de reprendre ; arrêter sur une modification de source. Le journal reprend au dernier lot vérifié et marque l'opération terminée seulement après rapprochement intégral. Une fois clôturée, la reprise reste désactivée.

Le cron ne supprime que dans D1. Les anciennes copies R2 restent hors de sa politique de conservation, conformément à la demande de ne rien supprimer de R2. Leur éventuel traitement ultérieur nécessite une décision distincte.
