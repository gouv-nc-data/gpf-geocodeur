# coding: utf-8
# Téléchargement et traitement des POIS
"""
Sources :
- SERAIL Immeubles (REFIL) : open data (xlsx)
- SERAIL Atlas : open data (xlsx)
- POI BDLOC (DITTT) : utilisation du Feature Layer hebergé dans l'ArcGIS Online du gouv (Opendata)
NB : seront exclus des POIs BDLOC les immeubles et atlas issus de SERAIL
"""

import myutils
import os
import json
import logging

CWD = os.path.dirname(os.path.realpath(__file__))

logger = logging.getLogger('ncadresse')

# URL du service REST
bdloc_fs_url = os.environ.get(
    "BDLOC_FEATURE_SERVICE_LAYER",
    "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/BDLOC/FeatureServer/13"
)

column_to_keep = ["libelle", "libel_abr", "categorie", "code_com", "commune_y", "X", "Y"]
renommage_champs = {
    "libelle": "name",
    "libel_abr": "toponym",
    "categorie": "category",
    "code_com": "citycode",
    "commune": "city",
    "X": "lon",
    "Y": "lat"

}

logger.info("Téléchargement de la BDLOC et import en geodataframe...")
bdloc_df = myutils.get_geodf_from_featureservice(bdloc_fs_url)

logger.info("Géométrie vers X et Y...")
# récupérer x, y dans des champs
bdloc_df["X"] = bdloc_df.geometry.x
bdloc_df["Y"] = bdloc_df.geometry.y

# Calcul code_comm depuis commune (libelle)
logger.info("Calcul du libelle commune (depuis code_com)...")
myutils.df_compute_commune(bdloc_df)

logger.info("Nettoyage et renommage des champs...")
# champs à conserver
column_to_keep = ["libelle", "libel_abr", "categorie", "code_com", "commune", "X", "Y"]
bdloc_df = bdloc_df[column_to_keep]

# Champs à renommer
bdloc_df = bdloc_df.rename(columns=renommage_champs)

# Champs à reclasser
reclass = ["name", "toponym", "citycode", "city", "category", "lon", "lat"]
bdloc_df = bdloc_df[reclass]

# Export en ndjson
logger.info("Export en ndjson...")
output_folder = os.environ.get("DATA_POI", CWD)
bdloc_df.to_json(os.path.join(output_folder, "poi.ndjson"), orient='records', lines=True)

# listing des categories
categories = bdloc_df["category"].unique()
# export des categories
categories_dict = {c:[] for c in categories}
with open(os.path.join(output_folder, "categories.json"), "w", encoding='utf-8') as f:
    json.dump(categories_dict, f)
