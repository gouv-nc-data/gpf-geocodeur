import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {gzipSync} from 'node:zlib'
import {Buffer} from 'node:buffer'
import test from 'ava'
import {asFeature, extractFeatures} from '../extract.js'

test('asFeature / ok', t => {
  const asFeaturesProperties = asFeature({
    lon: 12.25,
    lat: 55.08,
    property: 'Bonjour !'
  })

  t.deepEqual(asFeaturesProperties, {
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [12.25, 55.08]},
    properties: {property: 'Bonjour !'}
  })
})

async function createSourceFile(items) {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'extract-test-'))
  const filePath = path.join(tmpDir, 'adresses.ndjson.gz')
  const ndjson = items.map(item => JSON.stringify(item)).join('\n') + '\n'

  await writeFile(filePath, gzipSync(Buffer.from(ndjson)))

  return {tmpDir, filePath}
}

test('extractFeatures', async t => {
  const {tmpDir, filePath} = await createSourceFile([
    {id: '1', type: 'locality', name: 'Le Moulin', lon: 1, lat: 2},
    {id: '2', type: 'street', name: 'Rue des Champs', lon: 3, lat: 4, housenumbers: {
      1: {id: '3', lon: 10, lat: 11},
      2: {id: '4', lon: 20, lat: 21}
    }}
  ])

  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  const iterator = extractFeatures(filePath)
  const features = []

  for await (const feature of iterator) {
    features.push(feature)
  }

  t.deepEqual(features, [
    {
      type: 'Feature',
      geometry: {type: 'Point', coordinates: [1, 2]},
      properties: {
        id: '1',
        name: 'Le Moulin',
        type: 'locality'
      }
    },
    {
      type: 'Feature',
      geometry: {type: 'Point', coordinates: [3, 4]},
      properties: {
        id: '2',
        name: 'Rue des Champs',
        type: 'street'
      }
    },
    {
      type: 'Feature',
      geometry: {type: 'Point', coordinates: [10, 11]},
      properties: {
        id: '3',
        housenumber: '1',
        street: '2',
        type: 'housenumber'
      }
    },
    {
      type: 'Feature',
      geometry: {type: 'Point', coordinates: [20, 21]},
      properties: {
        id: '4',
        housenumber: '2',
        street: '2',
        type: 'housenumber'
      }
    }
  ])
})
