# Tests de jeu : étape « 2 semaines »

Objectif : vérifier que trois manches d'arcade d'affilée donnent envie de rejouer, avant d'ajouter défis, tricks ou progression.

## Préparer
- Ouvre **https://okidoki9903.github.io/Freesbee/#debug** sur l'appareil de test. Le panneau en bas à gauche affiche les mesures de l'appareil.
- Avant chaque testeur, appuie sur **Clear** pour repartir de zéro. À la fin, **Copy log** copie le journal brut (JSON) : colle-le dans un fichier par testeur.
- Rien n'est envoyé sur internet. Les mesures restent dans le navigateur.
- `?seconds=N` raccourcit une manche, par exemple `…/Freesbee/?seconds=20#debug`. C'est utile pour une démo, pas pour les vrais tests.

## Déroulé (12 à 15 personnes, au moins la moitié sur téléphone)
1. Donne l'appareil sans rien expliquer. Le jeu démarre directement en manche arcade de 60 s.
2. Observe sans aider : la personne comprend-elle quoi faire ? Relance-t-elle d'elle-même ?
3. Arrête-toi quand elle pose l'appareil. Note ses remarques telles quelles.

## Seuils de décision

| Question | Où la lire | Seuil |
|---|---|---|
| Comprend seul quoi faire | observation | ≥ 10 / 12 |
| Première prise rapide | `median first catch` (secondes depuis l'ouverture de la page, chargement compris) | < 20 s |
| Relance spontanée | `rematches` ≥ 1 pour la personne | ≥ 8 / 12 |
| Joue trois manches | `sessions with 3+ rounds` | ≥ 6 / 12 |
| Fluidité | `last round p95 frame` sur téléphone | < 33 ms, et pas de longues saccades pendant les prises (`longFrames` dans le journal) |

Si les gens relancent peu, on travaille d'abord la caméra, les contrôles et le rythme, avant d'ajouter du contenu.

## Événements enregistrés
`session_start`, `round_start` (mode, chien, difficulté, numéro de manche), `catch` (type, parfait, points, distance, hauteur), `first_catch`, `miss`, `round_end` (score, prises, parfaits, record, p95, longues images), `rematch`, `menu_open`.
