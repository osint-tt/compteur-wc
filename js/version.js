/**
 * Version affichée par l'app (paramètres).
 * Chargée en script classique par `index.html`.
 *
 * La même version est recopiée dans `sw.js`, où elle sert de nom de cache : c'est le
 * changement de `sw.js` qui fait détecter la mise à jour au navigateur. Un test unitaire
 * refuse que les deux (et `package.json`) divergent. À incrémenter partout à chaque mise en ligne.
 */
self.APP_VERSION = '1.0.2';
