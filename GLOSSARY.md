# bassPractice

Outil personnel pour apprendre la basse : à partir d'une vidéo YouTube, obtenir la ligne de basse d'un morceau et la travailler en suivant une tablature.

## Language

### Le morceau et son audio

**Morceau**:
Une chanson à travailler, identifiée par sa vidéo YouTube d'origine.
_Avoid_: Chanson, track, titre

**Audio original**:
Le mix complet du morceau, tel qu'extrait de la vidéo YouTube.
_Avoid_: Source, mix

**Piste basse**:
La basse seule, isolée de l'audio original par séparation de pistes.
_Avoid_: Stem basse, bass track

**Backing track**:
L'audio original privé de sa basse, pour jouer par-dessus.
_Avoid_: Playback, accompagnement, stem sans basse

### La ligne de basse

**Ligne de basse**:
La suite de notes jouées par la basse dans un morceau, indépendamment de sa notation.
_Avoid_: Partie de basse, bassline

**Transcription**:
La ligne de basse déduite automatiquement de la piste basse ; elle sert uniquement à initialiser la tablature.
_Avoid_: Détection, extraction

**Grille rythmique**:
Le tempo, la signature et la position de la première mesure d'un morceau, sur lesquels les notes sont calées.
_Avoid_: Beat grid, quantification

**Tablature**:
La notation de la ligne de basse en mesures, sur les cordes et frettes d'une basse 4 cordes accordée E A D G. C'est la seule version de référence, corrigée en place par l'utilisateur.
_Avoid_: Tab (à l'écrit), partition

**Position**:
Le couple corde + frette où une note est jouée sur le manche.
_Avoid_: Doigté, case

**Note hors manche**:
Une note de la ligne de basse qu'on ne peut pas jouer sur une basse 4 cordes en accordage standard (par exemple sous le Mi grave) ; elle est signalée, jamais cachée.

### La pratique

**Mixeur**:
Le réglage du volume de la backing track et de la piste basse pendant la lecture ; l'audio original n'est jamais joué tel quel.
_Avoid_: Balance, volume

**Vitesse**:
Le ralentissement de la lecture, de 50 % à 100 %, sans changer la hauteur des notes.
_Avoid_: Tempo (réservé à la grille rythmique), BPM

**Boucle**:
Une plage de mesures de la tablature, rejouée en continu.
_Avoid_: Section, loop, région

**Décompte**:
Une mesure de clics jouée avant chaque passage de la boucle.
_Avoid_: Count-in, pré-roll

### Organisation

**Bibliothèque**:
L'ensemble des morceaux déjà traités, conservés localement pour être rouverts sans retraitement.
_Avoid_: Historique, collection

**Traitement**:
La suite d'étapes qui transforme un lien YouTube en morceau prêt à travailler : téléchargement, séparation de pistes, transcription.
_Avoid_: Pipeline, job, import
