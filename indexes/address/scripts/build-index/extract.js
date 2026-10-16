import {createGunzip} from 'node:zlib'
import got from 'got'
import {parse} from 'ndjson'
import {omit} from 'lodash-es'


export async function * extractFeatures(fileUrl) {
  const downloadStream = got.stream(fileUrl)

  await new Promise((resolve, reject) => {
    function onError(errorMessage) {
      reject(new Error(`Failed to download file at URL: ${fileUrl} => ${errorMessage}`))
    }

    downloadStream.once('response', response => {
      if (response.statusCode === 200) {
        resolve()
      } else {
        onError()
      }
    })

    downloadStream.once('error', error => onError(error.message))
  })

  const inputStream = downloadStream
    .pipe(createGunzip())
    .pipe(parse())

  for await (const row of inputStream) {
    if (row.type === 'street') {
      let street = omit(row, 'housenumbers')

      if(row.housenumbers && row.housenumbers != {}){
        const numbers = Object.entries(row.housenumbers).map(([n, n_row]) => {
          n_row.housenumber = (isNaN(n)) ? n : parseInt(n);
          return n_row;
        })
        numbers.sort((n1,n2)=>{return (n1>n2) ? 1 : -1;})
        const middleIndex = Math.floor(numbers.length / 2);
        const middleNumber = numbers[middleIndex];
        for(let field in ["x", "y", "lon", "lat"]){
          if(street[field]) street[field] = middleNumber[field];
        }
      }

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
