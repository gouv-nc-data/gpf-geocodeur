import {createReadStream} from 'node:fs'
import {createGunzip} from 'node:zlib'
import {parse} from 'ndjson'
import {omit} from 'lodash-es'

/**
 * Lit un fichier NDJSON gzippé BAN/addok déjà téléchargé sur disque et produit
 * les features à indexer. Le téléchargement est fait en amont (cf. lib/download.js)
 * afin qu'une source indisponible n'entraîne pas la destruction de l'index existant.
 */
export async function * extractFeatures(filePath) {
  const inputStream = createReadStream(filePath)
    .pipe(createGunzip())
    .pipe(parse())

  for await (const row of inputStream) {
    if (row.type === 'street') {
      const street = omit(row, 'housenumbers')
      yield asFeature(street)

      for (const [housenumber, hnProperties] of Object.entries(row.housenumbers)) {
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

export function asFeature(properties) {
  return {
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [properties.lon, properties.lat]},
    properties: omit(properties, ['lon', 'lat'])
  }
}
