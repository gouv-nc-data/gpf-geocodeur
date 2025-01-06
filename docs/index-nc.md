# Géocodeur de la géoplateforme adapté pour la NC

## Démarrage rapide (Docker)

```bash
docker compose -f docker-compose.yml --profile build up
```
Cette commande permet de lancer la génération des index de données spécifiques à la NC
- address (issues de la BAN)
- cadastre : points cadastraux (centroides des parcelles cadastrales) issus du gouvernement

```bash
docker compose -f docker-compose.yml --profile api up
```
Le géocodeur sera lancé sur les données NC en quelques minutes, et sera accessible à l'adresse <http://localhost:3000>.
Il est obligatoire que les données indexées soient déjà disponibles (cf ci-dessus) pour que les API puissent se lancer


## Spécificté du build des données
Le build des données se fait via un script python principal indexes/nc_buil_all/index.py qui va lancer la génération des sources (fichiers ndjson au format attendu) puis les commandes yarn de génération des index.
La variable STORAGE_FS_DIR= /data dans les différentes services du docker compose permettent de stocker/partager les données ndjson et les index

Les addresses sont générés via les outils standards de la géoplateforme grâce aux variables d'environnement suivantes :
- DEPARTEMENTS= 988
- BAN_ADDOK_URL= https://adresse.data.gouv.fr/data/ban/adresses/latest/addok/adresses-addok-{dep}.ndjson.gz
- ADDRESS_INDEX_MDB_BASE_PATH= ./data/adresses/mbd_index
- ADDRESS_INDEX_PATH= ./data/adresses/index

Les points cadastraux sont générés via le script python indexes/nc_build_all/import_cadastre.py (pour générer le cadastre.ndjson) et la commande de génération des indexes standard. Cela nécessite les varaibles d'environnement suivantes :
- NC_CADASTRE_FEATURE_SERVICE_LAYER= https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/arcgis/rest/services/cadastre_centroide/FeatureServer/0
- CAD_INDEX_MDB_BASE_PATH= ./data/cadastre/mbd_index
- CAD_INDEX_PATH= ./data/cadastre/index
La source est donc l'url de la couche du FeatureService Esri publié dans le cloud esri du gouvernement.

Les POI sont générés via le script python indexes/nc_build_all/import_POI.py (pour générer le poi.ndjson) et la commande de génération des indexes standard. Cela nécessite les varaibles d'environnement suivantes :
- BDLOC_FEATURE_SERVICE_LAYER= https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/BDLOC/FeatureServer/13
- ATLAS_FEATURE_SERVICE_LAYER=https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/atlas_equipements_publics_serail/FeatureServer/0
- REFIL_XLSX_URL= https://data.gouv.nc/api/explore/v2.1/catalog/datasets/referentiel-des-immeubles-localises-refil/exports/xlsx
- POI_INDEX_MDB_BASE_PATH= ./data/poi/mbd_index
- POI_INDEX_PATH= ./data/poi/index
3 sources sont donc utilisées :
- l'export xlsx du REFIL (immeubles) SERAIL dans l'open data du gouvernement
- l'url de la couche de l'atlas des  équipement public SERAIL du FeatureService Esri publié dans le cloud esri du gouvernement (pour l'open data Esri du gouv)
- l'url de la couche des POI BDLOC du FeatureService Esri publié dans le cloud esri du gouvernement (pour l'open data Esri du gouv)
NB : le script python produit aussi un fichier categories.json, qui permet de fournir la liste des catégories exposée dans le getCapabilities de l'API

# Spécificité des sous-api
3 sous api sont utilisées :
- address : il s'agit de la sous-api standard IGN, juste épurée de quelques paramètres non nécessaires pour la NC
- poi : il s'agit de la sous-api standard de l'IGN, adaptée avec quelques spécificités NC (notamment des catégories adaptées aux données NC)
- cadastre : il s'agit d'une nouvelle sous-api, dérivée du mécanisme de celle des POI 
  - enrichie avec les données structurées cadastrales (nic, lot,  lotissement, section)
  - ne réutilisant pas la sous-api parcel de l'IGN car celle ci est adaptée aux données cadastrales françaises extrêmement différentes et ne gère pas la recherche fulltext, indispensable dans le contexte nc.

## Licence

MIT
