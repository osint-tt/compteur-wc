# Compteur WC

Petite app perso pour compter ses passages aux toilettes : cacas et pipis, avec l'heure et le lieu,
plus des statistiques sur 7, 30 ou 90 jours. Ajout en 2 taps. Tout reste sur le téléphone : aucun
compte, aucun serveur, aucune requête vers l'extérieur, et ça marche hors connexion.

**L'app : https://osint-tt.github.io/compteur-wc/**

## L'installer sur le téléphone

- **iPhone (Safari)** : ouvrir l'adresse ci-dessus → bouton Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : ouvrir l'adresse → menu ⋮ → « Installer l'application »
  (ou « Ajouter à l'écran d'accueil »).

**Important : installer l'app AVANT de saisir des données.** Sur iPhone, Safari et l'app installée
ne partagent pas leur stockage : ce qui a été saisi dans Safari n'apparaîtra pas dans l'app installée.

## Sauvegarder

Les données ne vivent que sur le téléphone. De temps en temps : **Paramètres → Exporter mes données**
(fichier `compteur-wc-AAAA-MM-JJ.json`, à garder dans les fichiers ou à s'envoyer).
Pour restaurer : **Paramètres → Importer une sauvegarde** (un résumé est affiché avant de remplacer).

## Modifier l'app plus tard

1. Changer le code.
2. Incrémenter la version aux trois endroits : `js/version.js`, `sw.js` et `package.json`.
   Un test unitaire échoue si elles ne sont pas identiques. C'est le changement de `sw.js` qui fait
   détecter la mise à jour au téléphone, et son numéro sert de nom de cache.
3. Lancer les tests : `npm test`.
4. Commiter et pousser sur `main`.

GitHub Pages publie en une minute environ. Le téléphone récupère la mise à jour à la prochaine
ouverture : un bandeau « Mise à jour disponible » apparaît, le bouton « Recharger » l'applique.
Une mise à jour ne touche jamais aux données.

## En local

```bash
npm install                # uniquement les outils de dev (Playwright)
npm start                  # http://localhost:5173
npm test                   # tests unitaires + end-to-end
npm run test:unit          # node --test, logique pure
npm run test:e2e           # Playwright, Chromium et WebKit
npm run icons              # régénère les PNG à partir des SVG
```

## Comment c'est fait

HTML, CSS et JavaScript (modules ES), sans framework ni étape de build : les fichiers du dépôt sont
servis tels quels. L'app n'a aucune dépendance et ne charge aucune ressource externe.

    index.html             écran unique, pictogrammes SVG inline
    css/style.css          thèmes clair/sombre en variables CSS
    js/logic.js            logique pure : heures, dates, stats, validation
    js/storage.js          localStorage (clé « compteur-wc »), migration, export/import
    js/app.js              interface, navigation, feuilles
    js/version.js          numéro de version affiché par l'app
    sw.js                  service worker : cache d'abord, hors ligne, mises à jour
    tests/                 tests unitaires, tests e2e, serveur statique
