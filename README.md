# Le Grand Tournoi des Tirlibibi — V1

## Ce que contient cette V1
- Comptes joueurs et compte Admin.
- Inscription par mail + mot de passe.
- Choix d'avatar.
- 5 propositions par joueur.
- Blocage des doublons avec message indiquant le joueur qui a déjà proposé le jeu.
- Classement obligatoire 1 à 5 pour les listes des autres joueurs.
- 1 veto par joueur et maximum 2 vetos reçus par liste.
- Sélection automatique : top 3 non-vetoés de chaque joueur.
- Sélection finale modifiable par l'Admin.
- Saisie des résultats 1er→5e.
- Barème 5/4/3/2/1 et classement.
- Première page de statistiques.
- API interne `/api/game-search` avec adaptateur prêt à être relié à un fournisseur de données de jeux.

## Lancer localement
Python 3.11+ recommandé.

```bash
python -m venv .venv
# Windows : .venv\Scripts\activate
# macOS/Linux : source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Puis ouvrir http://127.0.0.1:5000

## Comptes de démonstration
Joueurs :
- marie@example.com / Marie
- paul@example.com / Paul
- julie@example.com / Julie
- thomas@example.com / Thomas
- sophie@example.com / Sophie

Admin :
- admin@tirlibibi.local / Admin

À changer impérativement avant une mise en ligne.

## Reconnaissance des jeux
La route `/api/game-search` utilise actuellement une petite liste de secours afin que l'interface soit testable hors ligne. Pour la version en ligne, brancher un fournisseur de données de jeux de société dans cette route et enregistrer `image_url` avec le jeu validé.
