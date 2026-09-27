# Freesbee 🐕🥏

Jeu 3D en three.js : choisis ton chien, ton maître lance le frisbee, et tu dois l'attraper avant qu'il touche l'herbe.

Langues : anglais (par défaut), français, espagnol, portugais. Le choix se fait dans le menu, en haut du panneau.

Pour réfléchir à la suite du jeu avec d'autres outils : [docs/BRAINSTORM_PROMPT.md](docs/BRAINSTORM_PROMPT.md).

**Jouer en ligne : https://okidoki9903.github.io/Freesbee/** (après activation de GitHub Pages, voir plus bas)

## Les chiens

Chaque race a ses qualités, notées de 1 à 10, et sa propre silhouette (taille, pattes, oreilles, queue, robe).

| Chien           | Vitesse | Démarrage | Agilité | Saut | Endurance | Gueule | En bref                                  |
|-----------------|:-------:|:---------:|:-------:|:----:|:---------:|:------:|------------------------------------------|
| Border Collie   | 7       | 8         | 9       | 8    | 8         | 8      | Le plus complet                           |
| Lévrier         | 10      | 9         | 4       | 5    | 4         | 5      | Très rapide, tourne large, s'épuise vite  |
| Jack Russell    | 5       | 10        | 10      | 9    | 7         | 4      | Petit ressort, gueule courte              |
| Berger malinois | 8       | 8         | 7       | 10   | 7         | 7      | Le meilleur sauteur (~1,8 m)              |
| Labrador        | 6       | 5         | 5       | 5    | 9         | 10     | Rate rarement une prise, mais lourd       |
| Husky           | 8       | 6         | 6       | 6    | 10        | 6      | Sprinte presque sans fin                  |
| Corgi           | 4       | 8         | 9       | 3    | 8         | 6      | Tourne sur place, saute peu               |
| Dalmatien       | 8       | 7         | 6       | 7    | 9         | 6      | Bon partout                               |

- **Vitesse** : vitesse de course et de sprint.
- **Démarrage** : accélération.
- **Agilité** : vitesse de virage, surtout lancé.
- **Saut** : hauteur du saut et élan du bond vers le frisbee.
- **Endurance** : durée du sprint.
- **Gueule** : distance à laquelle le chien peut happer le frisbee, et vitesse de disque qu'il arrive encore à tenir.

## Commandes

| Action   | Clavier                          | Manette (8BitDo, Xbox, PlayStation…) | Tactile                   |
|----------|----------------------------------|--------------------------------------|---------------------------|
| Courir   | ZQSD (AZERTY) / WASD / flèches   | Stick gauche ou croix                | Joystick (pouce à gauche) |
| Sauter   | Espace (maintenir = plus haut)   | A ou B (maintenir = plus haut)       | Bouton « Saut »           |
| Sprinter | Maj                              | R, ZR, L, ZL, X ou Y                 | Bouton « Sprint »         |
| Caméra   | automatique                      | Stick droit                          | automatique               |
| Filmer   | R                                | Select                               | Bouton rouge              |
| Pause    | Échap ou P                       | Start                                | Bouton pause              |
| Menu     | ◀ ▶ chien, ▲ ▼ difficulté, Entrée | Croix, A ou Start                    | Toucher                   |

## Attraper le frisbee

- La tête du chien peut happer le disque dans un rayon qui dépend de la « gueule » de la race, devant lui et jusqu'à environ 115° sur les côtés. Il peut donc attraper **par-dessus l'épaule** en courant dans le sens du frisbee, comme un vrai chien (bonus ×1,5).
- Quand le disque arrive, le chien le suit des yeux, ouvre la gueule et tend le cou.
- **Sauter près du frisbee** lance un bond calculé vers un point de la trajectoire que le chien peut vraiment atteindre (« Plongeon ! »).
- Si le disque arrive trop vite par rapport au chien, il rebondit sur la tête (« Trop rapide ! »). S'il touche le corps, il ricoche (« Rebond ! »). Dans les deux cas, il est encore rattrapable.
- Au sol, le chien doit amener sa truffe sur le disque pour le ramasser. Il le rapporte ensuite dans la main du maître.

Points : prise simple ×1, au ras du sol ×1,5, en saut ×2, plongeon ×2,5, acrobatie ×3, plus un bonus de distance et le combo. Le mode Pro compte ×1,5.

## Filmer et partager sur X

1. Appuie sur **R**, **Select** ou le bouton rouge pour lancer l'enregistrement, et encore une fois pour l'arrêter (60 s max).
2. La vidéo contient l'image du jeu, le score, le son et un bandeau avec le lien du jeu.
3. **Télécharger la vidéo**, puis **Poster sur X** ouvre un post pré-rempli avec ton score et le lien. X ne permet pas à un site de joindre la vidéo à ta place : ajoute-la à la main.

Chrome, Edge et Safari récents enregistrent en MP4, le format qu'accepte X. Firefox n'enregistre qu'en WebM.

## Mise en ligne (GitHub Pages)

Le workflow `.github/workflows/pages.yml` publie le jeu à chaque push. Il faut l'activer une fois :

1. Sur GitHub : **Settings → Pages**.
2. Dans **Build and deployment → Source**, choisis **GitHub Actions**.
3. Relance le workflow (onglet **Actions → Deploy to GitHub Pages → Run workflow**) ou pousse un commit.

Le jeu est alors à l'adresse https://okidoki9903.github.io/Freesbee/. Le lien affiche une carte avec image (`og.png`) quand on le poste sur X.

## Lancer en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Sous le capot

- `src/sculpt.js` : « sculpture » du chien à la manière des métaballes de Blender. Des volumes (cônes arrondis, ellipsoïdes) fusionnent en douceur (smooth union de champs de distance), puis sont transformés en maillage lisse (surface nets, normales tirées du gradient). S'y ajoute une fourrure en couches (shell texturing).
- `src/dog.js` : chien procédural. Le corps est sculpté autour du squelette, lié aux os (skinning calculé d'après le volume le plus proche), et la robe est peinte par zones : ventre, poitrail, liste, masque, taches de dalmatien, manteau du husky.
  Squelette : chaque patte a trois segments pilotés par cinématique inverse (IK à deux os plus le pied), pour que les pattes se posent au sol sans glisser. L'allure passe du pas au trot puis au galop rotatoire selon la vitesse rapportée à la taille des pattes, avec l'ordre d'appui de chaque allure. La colonne se plie en deux moitiés au galop. Oreilles et queue sont montées sur ressorts.
- `src/owner.js` : maître articulé, animé par poses clés. Pour le revers : pas en avant, torsion hanches puis épaules, bras replié sur la poitrine, déroulé et accompagnement. Il se baisse aussi pour reprendre le frisbee dans la gueule du chien.
- `src/aero.js` : vol du frisbee, avec portance et traînée selon l'angle d'attaque (coefficients de Morrison/Hummel), roulis gyroscopique (turn et fade) et vent.
- `src/main.js` : physique à 120 Hz, inertie du chien, rayon de virage selon la vitesse, dérapages, saut à hauteur variable, bond d'interception, zone de prise, rebonds, ralenti sur les belles prises, caméra.
- `src/recorder.js` : capture du canvas et du son avec MediaRecorder, avec le score et le lien dessinés dans la vidéo.
- `src/world.js` : le parc, avec collines, herbe instanciée, massifs de fleurs, bosquets (feuillus, pins, bouleaux), étang (eau animée, roseaux, nénuphars, canards), allée avec bancs et lampadaires, papillons, oiseaux, pollen, promeneurs avec leur chien.
- `src/i18n.js` : traductions (EN, FR, ES, PT).
- `src/fx.js`, `src/audio.js`, `src/input.js` : particules et traînée, sons, clavier/tactile/manette.
