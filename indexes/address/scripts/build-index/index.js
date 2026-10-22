#!/usr/bin/env node
/* eslint no-await-in-loop: off, unicorn/no-process-exit: off */
import 'dotenv/config.js'

import process from 'node:process'
import path from 'node:path'
import {Readable} from 'node:stream'
import {rm} from 'node:fs/promises'

import logger from '../../../../lib/logger.js'
import {downloadFile} from '../../../../lib/download.js'
import {createIndexer} from '../../../../lib/spatial-index/indexer.js'
import {createImporter} from '../../../../lib/addok/importer.js'
import {computeDepartements} from '../../../../lib/cli.js'
import {ADDRESS_DATA_PATH, ADDRESS_INDEX_PATH, ADDRESS_INDEX_MDB_BASE_PATH} from '../../util/paths.js'
import {extractFeatures, extractAddokRows} from './extract.js'

const {BAN_ADDOK_URL} = process.env

// Une source BAN valide pèse toujours plus que ça : en dessous, c'est une page
// d'erreur ou un fichier tronqué.
const MIN_SOURCE_BYTES = 1024

export function getFileUrl(codeDepartement) {
  return BAN_ADDOK_URL.replace('{dep}', codeDepartement)
}

export function getSourceFilePath(codeDepartement) {
  return path.join(ADDRESS_DATA_PATH, `adresses-addok-${codeDepartement}.ndjson.gz`)
}

if (!BAN_ADDOK_URL) {
  logger.error('BAN_ADDOK_URL n\'est pas définie : impossible de construire l\'index adresse')
  process.exit(1)
}

const departements = computeDepartements('address')

if (departements.length === 0) {
  logger.error('Aucun département à indexer : vérifier la variable DEPARTEMENTS')
  process.exit(1)
}

/* Étape 1 — récupération de toutes les sources AVANT la moindre écriture dans
 * l'index. createImporter() et createIndexer() suppriment l'index existant :
 * tant qu'une source manque, on ne doit pas les appeler, sinon une simple
 * indisponibilité de la BAN détruit l'index précédent sans rien reconstruire. */
logger.log(`Downloading BAN sources for ${departements.length} departement(s)`)

const sources = []
const failures = []

for (const codeDepartement of departements) {
  const fileUrl = getFileUrl(codeDepartement)
  const filePath = getSourceFilePath(codeDepartement)

  try {
    const {size} = await downloadFile(fileUrl, filePath, {
      expectGzip: true,
      minBytes: MIN_SOURCE_BYTES
    })

    logger.log(` * ${codeDepartement} : OK (${size} octets)`)
    sources.push({codeDepartement, filePath})
  } catch (error) {
    logger.error(` * ${codeDepartement} : ÉCHEC — ${error.message}`)
    failures.push({codeDepartement, reason: error.message})
  }
}

// On boucle sur tous les départements avant de sortir, pour lister tous les
// problèmes en un seul passage. Mais le moindre échec fait sortir en erreur.
if (failures.length > 0) {
  logger.error(`Bilan des téléchargements : ${sources.length}/${departements.length} OK — en échec : ${failures.map(({codeDepartement, reason}) => `${codeDepartement} (${reason})`).join(', ')}`)
  logger.error('Abandon avant modification de l\'index : l\'index adresse précédent est conservé intact')
  process.exit(1)
}

logger.log(`Bilan des téléchargements : ${sources.length}/${departements.length} OK`)

/* Étape 2 — reconstruction. À partir d'ici l'index précédent est supprimé. */
logger.log('Rebuilding address index (previous index is dropped from now on)')

const addokImporter = await createImporter(ADDRESS_INDEX_PATH, './indexes/address/config/addok.conf')
const indexer = await createIndexer(ADDRESS_INDEX_MDB_BASE_PATH, {geometryType: 'Point'})

try {
  for (const {codeDepartement, filePath} of sources) {
    logger.log(`Index address data for departement ${codeDepartement}`)

    logger.log('Indexing into LMDB')
    await indexer.writeFeatures(extractFeatures(filePath))

    logger.log('Indexing into addok')
    // Lignes transformées (position médiane des voies), pas le fichier brut
    await addokImporter.batchImport(Readable.from(extractAddokRows(filePath)))
  }

  logger.log('Finishing spatial indexation computation')
  await indexer.finish()

  logger.log('Finishing addok importation')
  await addokImporter.finish()
} catch (error) {
  logger.error(`Échec de la construction de l'index adresse : ${error.message}`)
  // Contrairement à un échec de l'étape 1, l'index est ici partiellement écrit :
  // il faut relancer un build complet avant de redémarrer la sous-API adresse.
  logger.error('L\'index adresse est incomplet et inutilisable en l\'état : un nouveau build est nécessaire')
  logger.error(`Sources conservées dans ${ADDRESS_DATA_PATH} pour analyse`)
  process.exit(1)
}

// Les sources ne sont conservées qu'en cas d'échec, pour permettre l'analyse.
await Promise.all(sources.map(({filePath}) => rm(filePath, {force: true})))

logger.log('Address index build completed')
