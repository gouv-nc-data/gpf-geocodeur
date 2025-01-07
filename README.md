# Géocodeur NC
Le géocodeur NC utilise la stack technique du gécodeur de la plateforme IGN

Cette stack a été adpatée pour la NC :
- address : tel quel. Configuré pour utiliser le "département" 988 dans la BAN (Base adresse nationale)
- poi : adapté pour la NC : script python de téléchargement des données POI pour générer le fichier poi.ndjson compatible avec la stack préexistante
  - script custom de génération des poi.ndjson et categories.json
     - BDLOC
     - SERAIL REFIL (immeubles)
     - SERAIL Atlas (atlas des équippements)
- cadastre : dérivé du mécanisme des POIs, cet index et sous-api permet de requêter, y compris en full-text, les centroides de parcelles cadastrales NC.
  - non utilisation du mécanisme parcel IGN
    - car sans recherche full-text
    - car sur données cadastrales fr très différentes des données NC
  - Recherche full-text (NB : les centroides de parcelles sont considérés comme des simili adresses pour les communes NC non adressées)
  - script d'import en python depuis l'open data des centroides de parcelles cadastrales NC
  - ajout des champs descriptifs cadastraux

Un script général d'import et un service dans le docker compose permettent de gérer la chaine de traitement des données en 1 fois du téléchargement à la génération des indexes redis et addok.
Des profiles sont présent dans le docker compose permettant de lancer :
- all : tous les services (api et build)
- build : uniquement le service de build
- api : uniquement les services d'API (redis, api et 3 sous-api)
NB : pour que les services d'API fonctionne, il faut que le build ait été lancé et achevé au moins une fois. En effet, chaque sous-api charge ses index pré-buildés par le service de build dans /data/{type}/index (redis, lmdb et rtree)

## Documentation spécifique NC

- [doc NC](docs/index-nc.md)

## Démarrage rapide (Docker)

```bash
docker compose -f docker-compose-v3.yml up
```


# Géocodeur de la Géoplateforme IGN



## Démarrage rapide (Docker)

```bash
docker compose -f docker-compose.yml --profile all up
docker compose -f docker-compose.yml --profile build up
docker compose -f docker-compose.yml --profile api up
```

Le géocodeur sera lancé sur les données du département de la Moselle en quelques minutes, et sera accessible à l'adresse <http://localhost:3000>.

## Documentation

- [Architecture du service](docs/architecture.md)
- [Procédure d'installation](docs/user/installation.md)
- [Configuration](docs/user/configuration.md)
- [Génération des POI](docs/user/poi.md)
- [Production des index thématiques](docs/user/indexation.md)
- [Démarrage du service](docs/user/service.md)
- [Développement](docs/user/dev.md)

## Service en production de la Géoplateforme

Vous pouvez retrouver la [documentation du service](https://geoservices.ign.fr/services-geoplateforme-geocodage-autocompletion) sur le site officiel.

## Licence

MIT
