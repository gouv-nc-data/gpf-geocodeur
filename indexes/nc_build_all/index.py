# coding: utf-8
"""
Execution de tous les traitements de données.
Le but est ici de préparer toutes les données pour les services

"""
import os
import logging
import sys

CWD = os.path.dirname(os.path.realpath(__file__))
ROOT = os.path.realpath(os.path.join(CWD, "..", ".."))

DATA_FOLDER = os.environ.get("STORAGE_FS_DIR", os.path.join(ROOT, 'data'))

# Configurer le logger
logger = logging.getLogger('ncadresse')
logger.setLevel(logging.DEBUG)  # Niveau global du logger
# Créer un gestionnaire pour la console
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)  # Niveau pour la console
# Créer un gestionnaire pour un fichier
if not os.path.isdir(DATA_FOLDER):
    os.makedirs(DATA_FOLDER)
file_handler = logging.FileHandler(os.path.join(DATA_FOLDER, 'build.log'))
file_handler.setLevel(logging.DEBUG)  # Enregistrer uniquement les niveaux INFO et supérieurs

# Créer un formateur et l'ajouter au gestionnaire
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
file_handler.setFormatter(formatter)
# Ajouter le gestionnaire au logger
logger.addHandler(console_handler)
logger.addHandler(file_handler)

def execute_command(cmd, cwd=None):
    import subprocess
    proc = subprocess.Popen(cmd, shell=False, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=cwd)
    outs, errs = proc.communicate()
    if proc.returncode == 0:
        logger.info('Commande executee avec succes')
    else:
        logger.warning(f"Command return code : {proc.returncode}")
    if outs:
        logger.info(outs)
    if errs:
        logger.error(f"Une erreur s'est produite lors de l'execution de la commande {cmd}.")
        logger.error(errs)
        return False
    if proc.returncode != 0:
        return False
    return True


try:
    logger.info("--- Initialisation des dossiers data...")
    for theme in ["address", "poi", "cadastre"]:
        for foldername in ["data", "index"]:
            os.makedirs(os.path.join(DATA_FOLDER, theme, foldername), exist_ok=True)
except Exception as e:
    logger.error(f"Une erreur s'est produite lors de l'initialisation des dossiers data")
    logger.exception(e)
    sys.exit(1)

try:
    logger.info("------------------------------------- Cadastre...")
    os.environ["DATA_CADASTRE"] = os.path.join(DATA_FOLDER, 'cadastre', 'data')
    import import_cadastre
    execute_command(["node", "indexes/cadastre/scripts/build-index"], cwd=ROOT)
except Exception as e:
    logger.error(f"Une erreur s'est produite lors du traitement du cadastre")
    logger.exception(e)


try:
    logger.info("------------------------------------- POIs...")
    os.environ["DATA_POI"] = os.path.join(DATA_FOLDER, 'poi', 'data')
    import import_POI
    execute_command(["node", "indexes/poi/scripts/build-index"], cwd=ROOT)
except Exception as e:
    logger.error(f"Une erreur s'est produite lors du traitement des POIs")
    logger.exception(e)


try: 
    logger.info("------------------------------------- Adresses...")
    execute_command(["node", "indexes/address/scripts/build-index"], cwd=ROOT)
except Exception as e:
    logger.error(f"Une erreur s'est produite lors du traitement des adresses")
    logger.exception(e)


sys.exit(0)