# coding: utf-8
# Téléchargement et traitement des parcelles
"""
Utilisation du Feature Layer hebergé dans l'ArcGIS Online du gouv (Opendata)
"""
import myutils
import os
import json
import logging

CWD = os.path.dirname(os.path.realpath(__file__))

output_folder = CWD
if os.environ.get("STORAGE_FS_DIR", None):
    output_folder = os.path.join(os.environ.get("STORAGE_FS_DIR"), "cadastre", "data")

logger = logging.getLogger('ncadresse')

logger.info(f"Dossier d'export de données : {output_folder}")

cadastre_fs_url = os.environ.get(
    "NC_CADASTRE_FEATURE_SERVICE_LAYER",
    "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/arcgis/rest/services/cadastre_centroide/FeatureServer/0"
)

column_to_keep = ["name", "toponym", "category", "code_comm", "commune", "X", "Y", "nic", "lot", "surf_cad",
                  "section", "lotissement", "typologie", "nic2"]
renommage_champs = {
    "name": "name",
    "category": "category",
    "code_comm": "citycode",
    "toponym": "toponym",
    "id": "id",
    "commune": "city",
    "X": "lon",
    "Y": "lat",
    "nic": "nic",
    "surf_cad": "surf_cad",
    "typologie": "typologie",
    "nic2": "_id",
    "lot": "lot",
    "section": "section",
    "lotissement": "lotissement",
}

logger.info("Téléchargement du cadastre (centroides) et import en geodataframe...")
parcelles_df = myutils.get_geodf_from_featureservice(cadastre_fs_url)

logger.info("Géométrie vers X et Y...")
# récupérer x, y dans des champs
parcelles_df["X"] = parcelles_df.geometry.x
parcelles_df["Y"] = parcelles_df.geometry.y

# Calcul code_comm depuis commune (libelle)
logger.info("Calcul du code commune...")
myutils.df_compute_code_comm(parcelles_df)

# Créer champ name
logger.info("Création du champ name...")
parcelles_df["name"] = parcelles_df[["lot", "lotissement", "section"]].fillna("").apply(
    lambda x: ", ".join(filter(None, x)), axis=1)
parcelles_df["toponym"] = "Lot " + parcelles_df["name"]
parcelles_df["name"] = "Lot " + parcelles_df["name"] + " - " + parcelles_df["nic"]

logger.info("Création des autres champs...")
# Créer champ category
parcelles_df["category"] = "CADASTRE"

# Créer champ nic2 pour _id
parcelles_df["nic2"] = parcelles_df["nic"]

logger.info("Nettoyage et renommage des champs...")
# champs à conserver
parcelles_df = parcelles_df[column_to_keep]

# Champs à renommer
parcelles_df = parcelles_df.rename(columns=renommage_champs)
parcelles_df["source"] = 'DITTT - Cadastre'

# Champs à reclasser
reclass = ["name", "toponym", "citycode", "city", "category", "source", "surf_cad", "typologie", "nic", "lot", "section",
           "lotissement", "_id", "lon", "lat"]
parcelles_df = parcelles_df[reclass]

# Export en ndjson
logger.info("Export en ndjson...")
parcelles_df.to_json(os.path.join(output_folder, "cadastre.ndjson"), orient='records', lines=True)

# Fichier des categories
with open(os.path.join(output_folder, "categories.json"), "w", encoding='utf-8') as f:
    json.dump({"CADASTRE":[]}, f)
