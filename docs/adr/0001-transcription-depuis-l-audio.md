# La ligne de basse est transcrite depuis l'audio, pas récupérée depuis des tabs existantes

bassPractice est un outil personnel dont la seule entrée est un lien YouTube. Plutôt que de chercher une tablature écrite par un humain (Songsterr, Ultimate Guitar, fichiers Guitar Pro), on isole la piste basse de l'audio original par séparation de pistes, puis on en déduit la ligne de basse par détection de notes. Ce choix fonctionne pour n'importe quel morceau et ne dépend d'aucune source tierce, souvent sans API et protégée par le droit d'auteur. En contrepartie, la transcription est imprécise (rythme, octaves, ghost notes) : elle ne sert qu'à initialiser une tablature que l'utilisateur corrige.

## Considered Options

- **Récupérer des tabs existantes** : précis quand la tab existe, mais couverture partielle, scraping fragile et contenu protégé.
- **Hybride (tab existante sinon transcription)** : écarté pour la v1 ; une source de tabs existantes pourra s'ajouter plus tard comme autre manière d'initialiser une tablature.
