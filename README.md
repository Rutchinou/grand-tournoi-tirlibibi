# Le Grand Tournoi des Tirlibibi — version GitHub Pages

Cette version remplace le serveur Flask par :
- GitHub Pages pour l'affichage du site ;
- Supabase Auth pour les comptes ;
- Supabase PostgreSQL pour les données ;
- JavaScript côté navigateur.

## Mise en route

1. Dans Supabase, ouvrez SQL Editor et exécutez `supabase-schema.sql`.
2. Dans Supabase > Authentication > Providers, vérifiez que Email est activé.
3. Créez le compte administrateur avec le formulaire du site.
4. Dans SQL Editor, rendez ce compte administrateur :
   `update public.players set is_admin=true where lower(email)=lower('VOTRE_EMAIL');`
5. Ouvrez `config.js` et remplacez les deux valeurs par :
   - l'URL du projet Supabase ;
   - la clé Publishable/anon.
6. Envoyez tous les fichiers de ce dossier dans votre dépôt GitHub.
7. Activez GitHub Pages sur la branche `main`, dossier `/ (root)`.

Ne mettez JAMAIS le mot de passe PostgreSQL ou la clé `service_role` dans le dépôt.

## Fonctionnalités incluses

- inscription/connexion ;
- 5 joueurs maximum ;
- 5 propositions par joueur ;
- unicité des 25 jeux ;
- classement obligatoire 1 à 5 des listes adverses ;
- 1 veto par joueur et maximum 2 vetos par liste ;
- sélection automatique des 15 jeux (3 par joueur) ;
- sélection manuelle par l'administrateur ;
- verrouillage de la préparation ;
- tournoi et points 5/4/3/2/1 ;
- classement général ;
- statistiques individuelles.

La recherche automatique des boîtes/images des jeux n'est pas encore branchée : elle pourra être ajoutée ensuite sans changer le principe de l'application.

## Attention GitHub Pages

Avec GitHub Free, GitHub Pages nécessite un dépôt public. Avant de rendre le dépôt public,
vérifiez qu'il ne contient aucune clé `service_role`, aucun mot de passe PostgreSQL et aucun secret.
La clé Publishable/anon Supabase est prévue pour être utilisée dans un site public, avec les RLS ci-dessus.

## Ordre conseillé

1. Exécuter `supabase-schema.sql`.
2. Créer le compte administrateur.
3. Exécuter la requête `update ... set is_admin=true ...`.
4. Renseigner `config.js`.
5. Tester le site localement.
6. Publier avec GitHub Pages.
