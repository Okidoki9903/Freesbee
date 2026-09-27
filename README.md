# Freesbee 🐕🥏

Petit jeu 3D en three.js : tu joues le chien, ton maître lance le frisbee, et tu dois l'attraper avant qu'il touche l'herbe.

## Jouer

Le jeu tient dans un seul fichier, `index.html` (three.js est chargé depuis jsDelivr). Il faut le servir en HTTP :

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Commandes

| Action   | Clavier                         | Manette (8BitDo, Xbox, PlayStation…)          | Tactile                   |
|----------|---------------------------------|-----------------------------------------------|---------------------------|
| Courir   | ZQSD (AZERTY) / WASD / flèches  | Stick gauche ou croix                         | Joystick (pouce à gauche) |
| Sauter   | Espace (maintenir = plus haut)  | A ou B (maintenir = plus haut)                | Bouton « Saut »           |
| Sprinter | Maj                             | R, ZR, L, ZL, X ou Y                          | Bouton « Sprint »         |
| Caméra   | automatique                     | Stick droit                                   | automatique               |
| Pause    | Échap ou P                      | Start                                         | Bouton pause              |

### Manette 8BitDo

La manette passe par la Gamepad API du navigateur, en Bluetooth ou en USB :

1. Connecte la manette. En mode X-input (Windows/Android) elle apparaît comme une manette « standard ». Les modes Switch et D-input marchent aussi.
2. Ouvre le jeu et appuie sur un bouton : un navigateur ne signale une manette qu'après un premier appui. Le badge « 8BitDo » apparaît alors en haut à droite.
3. Appuie sur A ou Start pour lancer la partie.

Sauter et sprinter sont répartis sur plusieurs boutons, donc les dispositions Nintendo (A/B inversés) et Xbox marchent sans rien régler. La manette vibre quand tu attrapes le frisbee, si le navigateur le permet.

## Règles

- Le maître se tourne vers la direction du lancer juste avant de lancer : observe-le.
- Il varie ses lancers : plané (haut et lent), tendu (rapide et bas), courbé (penché sur le côté).
- Le vent se lève au fil de la partie (flèche en haut à gauche). Face au vent, le frisbee monte ; vent dans le dos, il file.
- Prise au sol ×1, en plein saut ×2, acrobatie (saut très haut) ×3, prise au ras du sol ×1,5, plus un bonus de distance.
- Les prises consécutives montent le combo (×1,5, ×2…). Rapporter le frisbee après une prise donne +50.
- Un frisbee qui touche le sol coûte une vie et remet le combo à zéro. 3 frisbees au sol : fin de partie.

## Sous le capot

- **Vol du frisbee** : portance et traînée calculées à partir de l'angle d'attaque entre l'air et le plan du disque (coefficients de Morrison/Hummel). Le moment de tangage devient un roulis par effet gyroscopique : le disque tourne un peu à haute vitesse, puis « fade » en ralentissant. Le vent modifie le flux d'air vu par le disque.
- **Au sol** : le frisbee rebondit, glisse avec frottement, puis se pose à plat.
- **Chien** : physique à pas fixe (120 Hz), accélération et freinage, rayon de virage qui grandit avec la vitesse, dérapage en demi-tour, saut à hauteur variable avec tampon d'entrée, réception amortie. La prise est testée sur toute la trajectoire du disque entre deux pas, pour qu'il ne « traverse » pas la gueule.
- **Rendu** : tone mapping ACES, ciel dégradé avec halo solaire, nuages, ~70 000 brins d'herbe instanciés qui ondulent au vent et s'écartent sous les pattes, particules (poussière, touffes d'herbe, confettis), traînée derrière le frisbee, oreilles et queue sur ressorts, caméra avec FOV dynamique et secousses.
