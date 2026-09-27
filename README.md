# Freesbee 🐕🥏

Petit jeu 3D en three.js : tu joues le chien, ton maître lance le frisbee, et tu dois l'attraper avant qu'il touche l'herbe.

## Jouer

Le jeu tient dans un seul fichier, `index.html` (three.js est chargé depuis jsDelivr). Il faut le servir en HTTP :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Commandes

| Action   | Clavier                          | Tactile                      |
|----------|----------------------------------|------------------------------|
| Courir   | ZQSD / WASD / flèches            | Joystick (pouce à gauche)    |
| Sauter   | Espace                           | Bouton « Saut »              |
| Sprinter | Maj (vide la jauge d'endurance)  | Bouton « Sprint »            |

## Règles

- Le maître se tourne vers la direction du lancer juste avant de lancer : observe-le.
- Prise au sol ×1, en plein saut ×2, acrobatie (saut très haut) ×3, plus un bonus de distance.
- Les prises consécutives montent le combo (×1,5, ×2…). Rapporter le frisbee au maître après une prise donne +50.
- Un frisbee qui touche le sol coûte une vie et remet le combo à zéro. 3 frisbees au sol : fin de partie.
- Les 3 premiers lancers affichent un cercle d'atterrissage. Ensuite il n'y a plus que l'ombre du frisbee.
- Les lancers deviennent plus longs et plus courbés au fil de la partie.
