# coding: utf-8
# Téléchargement et traitement des POIS
"""
Sources :
- SERAIL Immeubles (REFIL) : open data (xlsx)
- SERAIL Atlas : open data (xlsx)
- POI BDLOC (DITTT) : utilisation du Feature Layer hebergé dans l'ArcGIS Online du gouv (Opendata)
NB : seront exclus des POIs BDLOC les immeubles et atlas issus de SERAIL
"""
import pandas as pd

import myutils
import os
import json
import logging

CWD = os.path.dirname(os.path.realpath(__file__))


output_folder = CWD
if os.environ.get("STORAGE_FS_DIR", None):
    output_folder = os.path.join(os.environ.get("STORAGE_FS_DIR"), "poi", "data")


logger = logging.getLogger('ncadresse')

logger.info(f"Dossier d'export de données : {output_folder}")

category_df = pd.read_excel(os.path.join(CWD,"lib_court_to_category.xlsx"))
category_clean = pd.read_excel(os.path.join(CWD,"clean_cat.xlsx"))
type_df = pd.read_excel(os.path.join(CWD,"lib_court_to_type.xlsx"))
type_clean = pd.read_excel(os.path.join(CWD,"clean_type.xlsx"))


# URL du service REST
# BDLOC
bdloc_fs_url = os.environ.get(
    "BDLOC_FEATURE_SERVICE_LAYER",
    "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/BDLOC/FeatureServer/13"
)
# ATLAS
atlas_fs_url = os.environ.get(
    "ATLAS_FEATURE_SERVICE_LAYER",
    "https://services1.arcgis.com/TZcrgU6CIbqWt9Qv/ArcGIS/rest/services/atlas_equipements_publics_serail/FeatureServer/0"
)
# 
refil_xlsx_url = os.environ.get(
    "REFIL_XLSX_URL",
    "https://data.gouv.nc/api/explore/v2.1/catalog/datasets/referentiel-des-immeubles-localises-refil/exports/xlsx"
)

# Champs à reclasser
reclass = ["name", "toponym", "citycode", "city", "category", "type", "source", "lon", "lat", "id"]

logger.info("Téléchargement de la BDLOC et import en geodataframe...")
bdloc_df = myutils.get_geodf_from_featureservice(bdloc_fs_url)
logger.info("Téléchargement de l'atlas SERAIL et import en geodataframe...")
atlas_df = myutils.get_geodf_from_featureservice(atlas_fs_url)
logger.info("Téléchargement de REFIL et import en dataframe...")
refil_df = myutils.get_df_from_xlsx_url(refil_xlsx_url, os.path.join(output_folder, "tmp_refil_xlsx.xlsx"))

#################### ATLAS SERAIL #################
logger.info("--- Atlas SERAIL ---")
logger.info("Géométrie vers X et Y...")
atlas_df["X"] = atlas_df.geometry.x
atlas_df["Y"] = atlas_df.geometry.y

logger.info("Nettoyage et renommage des champs...")
atlas_col_to_keep = ["lib_ville", "lib_norme","lib_court","apparten","X","Y", "ident"]
atlas_df = atlas_df[atlas_col_to_keep]

logger.info("Calcul du code commune (depuis libelle)...")
com_name = {"apparten": "commune"}
atlas_df = atlas_df.rename(columns=com_name)
myutils.df_compute_code_comm(atlas_df)

# recupérer champ category et type à partir d'un merge
atlas_df = atlas_df.merge(category_df, on="lib_court", how="inner")
atlas_df = atlas_df.merge(type_df, on="lib_court", how="inner")

rename_atlas = {
    "lib_ville": "name",
    "lib_norme": "toponym",
    "commune": "city",
    "ident": "id",
    "X": "lon",
    "Y": "lat",
    "code_comm": "citycode"
}
atlas_df = atlas_df.rename(columns=rename_atlas)
atlas_df["source"] = 'Atlas SERAIL'
atlas_df["id"] = 'SERAIL_ATLAS_' + atlas_df["id"] 
atlas_df = atlas_df[reclass]

#################### REFIL SERAIL #################
logger.info("--- Refil (immeubles) SERAIL ---")
logger.info("Nettoyage et renommage des champs...")
refil_to_keep = ["nom", "ident", "idadrs1", "libadrs1","apparten","point_geo"]
refil_df = refil_df[refil_to_keep]

# Split point_geo par , pour refil
logger.info("point_Geo vers X et Y...")
refil_df[['lat', 'lon']] = refil_df['point_geo'].str.split(', ', expand=True)
refil_df['lon'] = refil_df['lon'].astype(float) 
refil_df['lat'] = refil_df['lat'].astype(float)  

logger.info("Calcul du code commune (depuis libelle)...")
com_name_refil = {"apparten": "commune"}
refil_df = refil_df.rename(columns=com_name_refil)
myutils.df_compute_code_comm(refil_df)

# Créer champs category pour base refil
refil_df["category"] = "LOCAL"
refil_df["type"] = "Imm"

rename_refil = {
    "nom": "name",
    "ident": "id",
    "libadrs1": "toponym",
    "commune": "city",
    "code_comm": "citycode"
}
refil_df = refil_df.rename(columns=rename_refil)
refil_df["source"] = 'REFIL SERAIL'
refil_df["id"] = "SERAIL_REFIL_" + refil_df["id"].astype(str)
refil_df = refil_df[reclass]

#################### BDLOC #################
logger.info("----------- BD LOC -------------")
logger.info("Suppression des données SERAIL...")
bdloc_df = bdloc_df[bdloc_df.origine !="SERAIL"]

logger.info("Géométrie vers X et Y...")
bdloc_df["X"] = bdloc_df.geometry.x
bdloc_df["Y"] = bdloc_df.geometry.y

# Calcul code_comm depuis commune (libelle)
logger.info("Calcul du libelle commune (depuis code_com)...")
myutils.df_compute_commune(bdloc_df)

logger.info("Nettoyage et renommage des champs...")
column_to_keep = ["libelle", "libel_abr", "categorie", "code_com", "commune", "type", "X", "Y", "globalid"]
bdloc_df = bdloc_df[column_to_keep]
# Champs à renommer
renommage_champs = {
    "libelle": "name",
    "libel_abr": "toponym",
    "categorie": "category",
    "code_com": "citycode",
    "globalid": "id",
    "commune": "city",
    "X": "lon",
    "Y": "lat"
}
bdloc_df = bdloc_df.rename(columns=renommage_champs)
bdloc_df["source"] = 'BDLOC DITTT'
bdloc_df["id"] = 'BDLOC_' + bdloc_df["id"]
bdloc_df = bdloc_df[reclass]


############ FUSION #########################
logger.info("----------- FUSION -------------")
logger.info("Combinaison des 3 sources...")
poi_result_df = pd.concat([refil_df, atlas_df, bdloc_df])

# Ajouter labelle propre pour category et type
poi_result_df = poi_result_df.merge(category_clean, on="category", how="inner")
poi_result_df = poi_result_df.merge(type_clean, on="type", how="inner")

# clean cat et type label
name_clean = {
    "category": "old_cat",
    "type": "old_typ",
    "complet_cat": "category",
    "type_complet": "type"
}
poi_result_df = poi_result_df.rename(columns=name_clean)
poi_result_df = poi_result_df[reclass]

# Export en ndjson
logger.info("Export en ndjson...")
poi_result_df.to_json(os.path.join(output_folder, "poi.ndjson"), orient='records', lines=True)

# listing des categories
categories = poi_result_df["category"].unique()
# export des categories
categories_dict = {c:[] for c in categories}
with open(os.path.join(output_folder, "categories.json"), "w", encoding='utf-8') as f:
    json.dump(categories_dict, f)
