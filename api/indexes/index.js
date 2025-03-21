import createAddressIndex from './address.js'
import createPoiIndex from './poi.js'
import createCadIndex from './cadastre.js'

const INDEX_CONSTRUCTORS = {
  address: createAddressIndex,
  poi: createPoiIndex,
  cadastre: createCadIndex
}

export async function dispatchRequestToIndexes(params, operation, indexes, options = {}) {
  const results = {}

  await Promise.all(params.indexes.map(async indexName => {
    if (!(indexName in indexes)) {
      throw new Error('Unsupported index type: ' + indexName)
    }

    if (!(operation in indexes[indexName])) {
      throw new Error(`Unsupported operation: ${operation} with the index: ${indexName}`)
    }

    const indexResult = await indexes[indexName][operation](params, options)
    results[indexName] = indexResult
  }))

  return results
}

export function createIndexes(indexes) {
  const instances = {}

  for (const indexName of indexes) {
    if (!(indexName in INDEX_CONSTRUCTORS)) {
      throw new Error('Unsupported index type: ' + indexName)
    }

    instances[indexName] = INDEX_CONSTRUCTORS[indexName]()
  }

  return {
    async dispatchRequest(params, operation, options = {}) {
      return dispatchRequestToIndexes(params, operation, instances, options)
    }
  }
}
