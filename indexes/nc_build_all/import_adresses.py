# coding: utf-8
# Téléchargement et traitement des parcelles
"""
Utilisation du Feature Layer hebergé dans l'ArcGIS Online du gouv (Opendata)
"""
import myutils
import os
import json
import logging
import requests

CWD = os.path.dirname(os.path.realpath(__file__))

output_folder = CWD
if os.environ.get("STORAGE_FS_DIR", None):
    output_folder = os.path.join(os.environ.get("STORAGE_FS_DIR"), "adresse", "data")

logger = logging.getLogger('ncadresse')

logger.info(f"Dossier d'export de données : {output_folder}")

ban_addok_url = os.environ.get(
    "BAN_ADDOK_URL",
    "https://adresse.data.gouv.fr/data/ban/adresses/latest/addok/adresses-addok-{dep}.ndjson.gz"
)
dep = os.environ.get(
    "DEPARTEMENTS",
    "988"
)


logger.info("Téléchargement du fichier BAN 988...")
tgz_url = ban_addok_url.format(dep=dep)
nom_gz = tgz_url.split("/")[-1]
gz_path = os.path.join(output_folder, nom_gz)
with requests.get(tgz_url, stream=True) as response:
    response.raise_for_status()
    with open(gz_path, 'wb') as file:
        for chunk in response.iter_content(chunk_size=8192):  # Adjust chunk size as needed
            if chunk:  # Filter out keep-alive new chunks
                file.write(chunk)
if os.path.isfile(gz_path):
    logging.info(gz_path)
else:
    logging.error(gz_path)
    raise "Le gz n'existe pas"
print(gz_path)

logger.info("Extraction du ndjson depuis l'archive tgz...")
import tarfile

ndjson_path = None
with tarfile.open(gz_path, 'r:gz') as tar:
    fichiers = tar.getnames()
    for fichier in fichiers:
        print(fichier)
        if fichier.endswith(".ndjson"):
            ndjson_path = os.path.join(output_folder, fichier)
            tar.extract(fichier, path=ndjson_path)

logging.info(ndjson_path)
