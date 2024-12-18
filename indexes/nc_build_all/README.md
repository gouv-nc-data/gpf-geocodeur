# Build des index de données NC

Ce dossier comprend les utilitaires pour :
- Télécharger et construire les fichiers ndjson pour les POIs et le cadastre
- pour les adresses, télécharger les données générées par la BAN
- appeler les process node IGN pour créer les indexes depuis ces ndjson

NB : ajout de 3 modules dans le requirements.py

Le Script principal est indexes/nc_build_all/index.py
- génération des ndjson : il va lancer les scripts pyton pour POI et cadastre NC et lancer la commande node pour les adresses.
- lancement des scripts node pour création des indexes (redis, lmdb et rtree)

Les données ndjson, index (et les fichiers de catégories) sont écrit dans le volume /data afin de pouvoir être utilisé directement par les services API. On évite ainsi d'avoir à packager les index en archive tar.gz à mettre à disposition aux services API. Ces services api accèdent directement aux index sur le volume /data