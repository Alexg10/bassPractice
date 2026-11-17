# alphaTab affiche la tablature et suit notre audio ; notre modèle reste la source de vérité

La tablature est affichée par alphaTab (1.9) en mode `PlayerMode.EnabledExternalMedia` : alphaTab ne produit aucun son, il dessine la tablature et place son curseur d'après la position de notre propre lecteur audio, qu'on lui pousse à chaque image. On convertit notre modèle de tablature en alphaTex à chaque modification ; le décalage de la première mesure dans l'audio (grille rythmique) passe par `\sync 0 0 <ms>`. alphaTab n'est jamais la source de vérité : l'éditeur modifie notre modèle, puis re-rend.

Validé par le prototype de l'issue #9 (`web/prototype/alphatab-sync.ts`), sur une tablature de 120 mesures (~4 min 50) :

- Écart nul entre la mesure attendue (d'après le temps audio) et la mesure surlignée, à 100 % et à 50 % de vitesse, après un saut par clic sur la tablature.
- Rendu complet en 26–72 ms après une modification : compatible avec un éditeur qui re-rend tout.
- La boucle sur une plage de mesures fonctionne : alphaTab demande lui-même le retour au début de la plage à notre lecteur, avec ~20 ms de retard au plus.

## Considered Options

- **Rendu maison (SVG/canvas)** : contrôle total, mais mise en page des mesures, ligatures, défilement et curseur à réécrire. Écarté tant qu'alphaTab tient.
- **Synthé interne d'alphaTab** : écarté ; on joue la vraie piste basse et la backing track (voir ADR 0001).

## Consequences

- **Métronome et décompte sont à notre charge.** En mode média externe, alphaTab ne produit aucun son : ses réglages `metronomeVolume` et `countInVolume` sont muets. On génère nous-mêmes les clics, calés sur la grille rythmique.
- **Recharger la tablature arrête la lecture et revient au début.** L'éditeur doit mémoriser la position et la restaurer après chaque re-rendu.
- **Notre lecteur pilote deux pistes (backing track + piste basse) derrière un seul `IExternalMediaHandler`.** Il doit les garder synchrones entre elles, y compris au ralenti sans changer la hauteur et lors des sauts de boucle.
