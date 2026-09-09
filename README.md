# Le Grand Tournoi des Tirlibibi

Application Flask pour un tournoi de 5 joueurs.

## Déploiement

Variables d'environnement nécessaires :

- `DATABASE_URL` : chaîne de connexion PostgreSQL/Supabase
- `SECRET_KEY` : longue valeur aléatoire
- `ADMIN_EMAIL` : email du compte administrateur
- `ADMIN_PASSWORD` : mot de passe du compte administrateur
- `ADMIN_NAME` : nom affiché de l'administrateur (facultatif)

Commande de démarrage Render :

`gunicorn app:app`

Le projet utilise directement PostgreSQL/Supabase. Le fichier SQLite `tirlibibi.db` n'est plus utilisé et ne doit pas être ajouté au dépôt.
