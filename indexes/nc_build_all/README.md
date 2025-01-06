# Build des index de données NC

Ce dossier comprend les utilitaires pour :
- Télécharger et construire les fichiers ndjson pour les POIs et le cadastre
- pour les adresses, télécharger les données générées par la BAN
- appeler les process node IGN pour créer les indexes depuis ces ndjson

NB : ajout de 3 modules dans le requirements.py

Le Script principal est indexes/nc_build_all.py
- génération des ndjson : il va lancer les scripts pyton pour POI et cadastre NC et lancé les commandes node pour les adresses.
- lancement des scripts node pour indexation