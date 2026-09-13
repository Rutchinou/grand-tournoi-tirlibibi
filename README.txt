LE GRAND TOURNOI DES TIRLIBIBI
Intégration des images des jeux — version prête pour GitHub

INSTALLATION
1. Remplacer le fichier app.js actuel du dépôt GitHub par celui fourni ici.
2. Ne pas modifier config.js, index.html, style.css ni les règles Firebase.
3. Attendre le déploiement GitHub Pages puis faire Ctrl+F5.

NOUVEAU COMPORTEMENT
- Lorsqu'un joueur ajoute un jeu, une recherche d'images Wikimedia Commons est lancée.
- Plusieurs résultats sont proposés visuellement.
- Le joueur choisit la bonne boîte.
- Il peut aussi continuer sans image si rien ne convient.
- Le document games enregistre image_url, image_thumb_url, image_source, image_id et image_title.
- L'image suit automatiquement le jeu dans les listes, la sélection, le tournoi, la saisie du résultat et les statistiques.
- Aucun changement volontaire du fonctionnement Firebase existant.
- Le calendrier reste limité aux dates à partir d'aujourd'hui.

NOTE
La recherche d'images nécessite une connexion internet au moment de l'ajout du jeu.
Si la recherche échoue, le jeu peut quand même être ajouté sans image.
