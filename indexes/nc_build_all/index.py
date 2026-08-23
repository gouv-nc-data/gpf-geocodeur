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
INDEXES = os.environ.get("GEOCODE_INDEXES", "address,cadastre,poi").split(",")

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

    printable_cmd = " ".join(cmd)
    logger.info(f"Execution de : {printable_cmd}")

    proc = subprocess.Popen(
        cmd,
        shell=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        text=True,
        bufsize=1,
    )

    # Les logs sont relayés ligne par ligne, et non bufferisés jusqu'à la fin :
    # indispensable pour suivre un build long et pour garder la trace d'une
    # erreur même si le process est tué (OOM, timeout).
    for line in proc.stdout:
        logger.info(line.rstrip())

    returncode = proc.wait()

    if returncode == 0:
        logger.info(f"Commande executee avec succes : {printable_cmd}")
        return True

    logger.error(f"Echec de la commande {printable_cmd} (code retour {returncode})")
    return False


# Bilan par étape, journalisé en fin d'execution : indispensable pour savoir
# lesquelles ont échoué sans avoir à relire tout le log.
results = {}

try:
    logger.info("--- Initialisation des dossiers data...")
    for theme in ["address", "poi", "cadastre"]:
        for foldername in ["data", "index"]:
            os.makedirs(os.path.join(DATA_FOLDER, theme, foldername), exist_ok=True)
except Exception as e:
    logger.error(f"Une erreur s'est produite lors de l'initialisation des dossiers data")
    logger.exception(e)
    sys.exit(1)

logger.info("------------------------------------- Cadastre...")
if "cadastre" in INDEXES:
    try:
        os.environ["DATA_CADASTRE"] = os.path.join(DATA_FOLDER, 'cadastre', 'data')
        import import_cadastre
        results["cadastre"] = execute_command(["node", "indexes/cadastre/scripts/build-index"], cwd=ROOT)
    except Exception as e:
        results["cadastre"] = False
        logger.error(f"Une erreur s'est produite lors du traitement du cadastre")
        logger.exception(e)
else:
    logger.info(f"cadastre non demandé à indexer parmi : {INDEXES}")

logger.info("------------------------------------- POIs...")
if "poi" in INDEXES:
    try:
        os.environ["DATA_POI"] = os.path.join(DATA_FOLDER, 'poi', 'data')
        import import_POI
        results["poi"] = execute_command(["node", "indexes/poi/scripts/build-index"], cwd=ROOT)
    except Exception as e:
        results["poi"] = False
        logger.error(f"Une erreur s'est produite lors du traitement des POIs")
        logger.exception(e)
else:
    logger.info(f"poi non demandé à indexer parmi : {INDEXES}")


logger.info("------------------------------------- Adresses...")
if "address" in INDEXES:
    try:
        results["address"] = execute_command(["node", "indexes/address/scripts/build-index"], cwd=ROOT)
    except Exception as e:
        results["address"] = False
        logger.error(f"Une erreur s'est produite lors du traitement des adresses")
        logger.exception(e)
else:
    logger.info(f"address non demandé à indexer parmi : {INDEXES}")

logger.info("------------------------------------- Bilan")
for theme, success in results.items():
    logger.info(f"{theme} : {'OK' if success else 'ECHEC'}")

failed = [theme for theme, success in results.items() if not success]

if failed:
    logger.error(f"Build en echec sur : {', '.join(failed)}")
    sys.exit(1)

logger.info("Build termine avec succes")
sys.exit(0)
