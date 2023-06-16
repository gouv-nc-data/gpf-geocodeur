import process from 'node:process'
import {rm} from 'node:fs/promises'

import gdal from 'gdal-async'
import Flatbush from 'flatbush'

import {getPath} from './util.js'
import {downloadAndExtractToTmp} from './extract.js'

const {ADMIN_EXPRESS_URL} = process.env

function featureToBbox(feature) {
  const envelope = feature.getGeometry().getEnvelope()
  return [envelope.minX, envelope.minY, envelope.maxX, envelope.maxY]
}

export async function createCommunesIndex() {
  const adminExpressPath = await downloadAndExtractToTmp(ADMIN_EXPRESS_URL)

  const communesPath = await getPath(adminExpressPath, 'COMMUNE.SHP')
  const arrondissementsPath = await getPath(adminExpressPath, 'ARRONDISSEMENT_MUNICIPAL.SHP')

  const communesDataset = gdal.open(communesPath)
  const arrondissementsDataset = gdal.open(arrondissementsPath)

  const communesLayer = communesDataset.layers.get(0)
  const arrondissementsLayer = arrondissementsDataset.layers.get(0)

  const communes = []
  const bboxes = []

  for await (const feature of communesLayer.features) {
    const code = feature.fields.get('INSEE_COM')
    communes.push({code, feature})
    bboxes.push(featureToBbox(feature))
  }

  for await (const feature of arrondissementsLayer.features) {
    const code = feature.fields.get('INSEE_ARM')
    communes.push({code, feature})
    bboxes.push(featureToBbox(feature))
  }

  const rtree = new Flatbush(communes.length)

  for (const bbox of bboxes) {
    rtree.add(...bbox)
  }

  rtree.finish()

  return {
    getIntersectingCommunes(geometry) {
      const envelope = geometry.getEnvelope()
      const refMeasure = getMeasure(geometry)

      const candidates = rtree.search(envelope.minX, envelope.minY, envelope.maxX, envelope.maxY)
        .map(idx => {
          const {feature: candidateFeature, code} = communes[idx]

          if (geometry.dimension === 0) {
            return {code, score: candidateFeature.getGeometry().intersects(geometry) ? 1 : 0}
          }

          const intersection = candidateFeature.getGeometry().intersection(geometry)

          if (!intersection || intersection.dimension !== geometry.dimension) {
            return {code, score: 0}
          }

          return {code, score: getMeasure(intersection) / refMeasure}
        })
        .filter(c => c.score > 0)

      const intersectionCommunes = candidates.length === 1
        ? candidates
        : candidates.filter(c => c.score > 0.4)

      return intersectionCommunes.map(c => c.code)
    },

    async close() {
      communesDataset.close()
      arrondissementsDataset.close()
      await rm(adminExpressPath, {recursive: true})
    }
  }
}

function getMeasure(geometry) {
  if (geometry.dimension === 0) {
    return 1
  }

  if (geometry.dimension === 1) {
    return geometry.getLength()
  }

  return geometry.getArea()
}