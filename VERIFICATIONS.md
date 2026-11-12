# Vérifications du 12 novembre 2026

Périmètre : neuf pages HTML. Stack : HTML/CSS, JavaScript natif pour l'outil de bienvenue.

## Contrôles sur les sources
- Pied de page strictement identique sur les neuf pages, avec les sept liens demandés.
- Une zone main et un lien d'évitement par page.
- Identifiants uniques et destinations de tous les liens internes et ancres vérifiées.
- Six nouvelles pages avec un même gabarit, langue française et titres distincts.
- Contact par mailto:loczen@locazen.com, sans formulaire de contact.
- Aucune ressource distante chargée par les sources HTML/CSS/JS.
- Aucun traceur, cookie, stockage local ou secret ajouté.
- Plan du site dans info-site.html ; tableaux défilants atteignables au clavier.
- Styles communs locaux, sans framework ni nouvelle dépendance.

## Limites
L'environnement d'exécution était indisponible. Aucun test dans un navigateur, validation par un validateur HTML, audit automatisé RGAA ou script Green Claude n'a pu être exécuté.
À vérifier : navigation clavier et focus, lecteur d'écran, contrastes rendus, zoom à 200 %, largeur de 320 px, espacement du texte augmenté, contenu sans CSS, portrait et paysage.
Ce document n'est pas un audit des 106 critères RGAA et ne fournit aucun taux de conformité ou score environnemental. Accessibilité : non conforme, faute d'audit complet.

Les informations légales manquantes sont signalées ; elles ne sont pas inventées.
« Site de Locazen » pointe vers l'accueil du présent site ; aucune URL distincte n'a été confirmée.

La conservation annoncée est de 7 jours. Configurer et vérifier la suppression dans la messagerie, les journaux d'hébergement et tout stockage utilisé. Le Worker existant worker/src/index.js écrit dans R2 ; aucune page actuelle ne l'appelle et son cycle de suppression n'a pas été modifié. Une règle de cycle de vie R2 et les politiques des autres services doivent être vérifiées séparément.

## Références
- RGAA : https://github.com/etalab-ia/skills/tree/main/skills/rgaa
- Green Claude : https://github.com/Institut-du-Numerique-Responsable/green-claude/tree/main/skills/green-claude
- ECO-ARCH-01, ECO-ARCH-07, ECO-FRONT-01 : HTML/CSS statiques, sans bibliothèque ajoutée.
- Métriques CPU, énergie, carbone et consommation de tokens : indisponibles.

## Domaines tiers chargés
Aucun dans les sources vérifiées. Les liens externes chargent leur destination seulement après navigation volontaire. Les injections éventuelles de la plateforme restent à vérifier sur le site déployé.
