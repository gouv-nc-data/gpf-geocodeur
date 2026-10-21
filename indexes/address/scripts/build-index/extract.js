import {createReadStream} from 'node:fs'
import {createGunzip} from 'node:zlib'
import {parse} from 'ndjson'
import {omit} from 'lodash-es'

const POSITION_FIELDS = ['x', 'y', 'lon', 'lat']

function compareHousenumbers(a, b) {
  const diff = (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0)
  return diff === 0 ? a.localeCompare(b) : diff
}

/**
 * Remplace la position d'une voie par celle de son numéro médian (tri par numéro),
 * afin que la voie soit positionnée sur une adresse réelle.
 */
export function applyMedianPosition(row) {
  if (row.type !== 'street' || !row.housenumbers) {
    return row
  }

  const housenumbers = Object.keys(row.housenumbers).sort(compareHousenumbers)

  if (housenumbers.length === 0) {
    return row
  }

  const middleNumber = row.housenumbers[housenumbers[Math.floor(housenumbers.length / 2)]]
  const street = {...row}

  for (const field of POSITION_FIELDS) {
    if (field in street && middleNumber[field] !== undefined) {
      street[field] = middleNumber[field]
    }
  }

  return street
}

/**
 * Lit un fichier NDJSON gzippé BAN/addok et renvoie les lignes, avec la position
 * des voies recalculée. Sert à la fois à l'index LMDB et à l'import addok.
 */
export async function * readRows(filePath) {
  const inputStream = createReadStream(filePath)
    .pipe(createGunzip())
    .pipe(parse())

  for await (const row of inputStream) {
    yield applyMedianPosition(row)
  }
}

/**
 * Lit un fichier NDJSON gzippé BAN/addok déjà téléchargé sur disque et produit
 * les features à indexer. Le téléchargement est fait en amont (cf. lib/download.js)
 * afin qu'une source indisponible n'entraîne pas la destruction de l'index existant.
 */
export async function * extractFeatures(filePath) {
  for await (const row of readRows(filePath)) {
    if (row.type === 'street') {
      const street = omit(row, 'housenumbers')

      yield asFeature(street)

      for (const [housenumber, hnProperties] of Object.entries(row.housenumbers || {})) {
        yield asFeature({
          type: 'housenumber',
          housenumber,
          street: street.id,
          ...hnProperties
        })
      }
    } else {
      yield asFeature(row)
    }
  }
}

/**
 * Flux NDJSON (texte) des lignes transformées, à passer en entrée de `addok batch`.
 */
export async function * extractAddokRows(filePath) {
  for await (const row of readRows(filePath)) {
    yield JSON.stringify(row) + '\n'
  }
}

export function asFeature(properties) {
  return {
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [properties.lon, properties.lat]},
    properties: omit(properties, ['lon', 'lat'])
  }
}
