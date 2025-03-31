import createError from 'http-errors'
import {hint} from '@mapbox/geojsonhint'
import computeBbox from '@turf/bbox'

import {validateStructuredSearchParams} from '../../lib/parcel/structured-search.js'
import {bboxMaxLength} from '../../lib/spatial-index/util.js'
import {validateCircle} from '../../lib/geometries.js'

import {extractSingleParams, isFirstCharValid, isDepartmentcodeValid} from '../util/params.js'
import {normalizeQuery} from '../util/querystring.js'
import {searchCity} from '../util/search-city.js'

const SEARCHGEOM_BBOX_MAX_LENGTH = 1000

export function validateSearchgeom(searchgeom) {
  if (!Object.hasOwn(searchgeom, 'type')) {
    throw createError(400, 'geometry object must have a \'type\' property')
  }

  // NB : seule les geometries circle et polygon sont autorisees
  const allowedGeometryTypes = new Set([
    //'Point',
    //'LineString',
    'Polygon',
    'Circle'
  ])

  if (!allowedGeometryTypes.has(searchgeom.type)) {
    throw createError(400, `geometry type (${searchgeom.type}) not allowed`)
  }

  if (searchgeom.type === 'Circle') {
    return validateCircle(searchgeom, SEARCHGEOM_BBOX_MAX_LENGTH / 2)
  }

  const errors = hint(searchgeom)

  if (errors.length > 0) {
    throw createError(400, `geometry not valid: ${errors[0].message}`)
  }

  const bbox = computeBbox(searchgeom)
  if (bboxMaxLength(bbox) > SEARCHGEOM_BBOX_MAX_LENGTH / 1000) {
    throw createError(400, `geometry is too big: bbox max length must be less than ${SEARCHGEOM_BBOX_MAX_LENGTH}m`)
  }
}

export const PARAMS = {
  indexes: {
    nameInQuery: 'index',
    type: 'string',
    array: true,
    required: false,
    allowedValues: ['address', 'poi', 'cadastre'],
    defaultValue: ['address'],
    description: 'index de recherche',
    example: 'address,poi,cadastre'
  },

  searchgeom: {
    type: 'object',
    validate(v) {
      validateSearchgeom(v)
    },
    operation: 'reverse',
    description: 'géométrie de recherche par intersection spatiale. Les géométries autorisées sont : Polygon et Circle. LineString et Point sont inopérants pour tous les index.',
    example: '{"type":"Polygon","coordinates":[[[166.47425293922427,-22.27873203987504],[166.47491812705996,-22.28007726844695],[166.47783637046817,-22.28009216020375],[166.47673130035403,-22.27776902697212],[166.47527217864993,-22.27779384697554],[166.47425293922427,-22.27873203987504]]]}'
  },

  q: {
    type: 'string',
    validate(v) {
      if (v.length < 3 || v.length > 200 || !isFirstCharValid(v)) {
        throw new Error('must contain between 3 and 200 chars and start with a number or a letter')
      }
    },
    operation: 'search',
    description: 'Chaîne décrivant la localisation à rechercher',
    example: '127 rue Daly'
  },

  limit: {
    type: 'integer',
    defaultValue: 10,
    validate(v) {
      if (v < 1 || v > 20) {
        throw new Error('must be an integer between 1 and 20')
      }
    },
    description: 'Nombre maximum de candidats retournés',
    example: '5'
  },

  lon: {
    type: 'float',
    validate(v) {
      if (v < -180 || v > 180) {
        throw new Error('must be a float between -180 and 180')
      }
    },
    description: 'Longitude d’un localisant pour favoriser les candidats les plus proches',
    example: '166.47527'
  },

  lat: {
    type: 'float',
    validate(v) {
      if (v < -90 || v > 90) {
        throw new Error('must be a float between -90 and 90')
      }
    },
    description: 'Latitude d’un localisant pour favoriser les candidats les plus proches',
    example: '-22.27779'
  },

  type: {
    type: 'string',
    allowedValues: ['housenumber', 'street', 'locality', 'municipality'],
    description: 'filtre pour l’index address. Il permet de filtrer par type de données adresse : numéro de maison, rue, commune, ...',
    example: 'housenumber'
  },

  postcode: {
    type: 'string',
    validate(v) {
      if (!/^\d{5}$/.test(v)) {
        throw new Error('must contain 5 digits')
      }
    },
    description: 'filtre pour index address uniquement. Il permet de filtrer les résultats par code postal',
    example: '98800'
  },

  citycode: {
    type: 'string',
    validate(v) {
      if (!/^(\d{5}|\d[AB]\d{3})$/.test(v)) {
        throw new Error('not valid')
      }
    },
    description: 'filtre pour les index address et poi. Il permet de filtrer les résultats par code INSEE',
    example: '98818'
  },

  city: {
    type: 'string',
    validate(v) {
      if (v.length > 50) {
        throw new Error('must contain between 1 and 50 chars')
      }
    },
    description: 'filtre pour les index address et poi. Il permet de filtrer par nom de commune',
    example: 'KONE'
  },

  category: {
    type: 'string',
    description: 'filtre pour l’index poi. Il permet de filtrer par catégorie de poi',
    example: 'Administratif'
  },

  returntruegeometry: {
    type: 'boolean',
    defaultValue: false,
    description: 'indique si la vraie géométrie doit être retournée',
    example: 'false'
  },

  autocomplete: {
    type: 'boolean',
    defaultValue: true,
    description: 'indique si la recherche doit être réalisée en mode auto-complétion. Pertinent uniquement pour la saisie en direct d\'utilisateurs',
    example: 'false'
  }
}

export function hasStructuredSearchParams(params) {
  return Boolean(
    params.departmentcode
    || params.municipalitycode
    || params.oldmunicipalitycode
    || params.districtcode
    || params.section
    || params.sheet
    || params.number
  )
}

export function validateLonLat(params) {
  const hasLat = 'lat' in params
  const hasLon = 'lon' in params

  if ((hasLat && !hasLon) || (hasLon && !hasLat)) {
    throw createError(400, 'Failed parsing query', {detail: ['lon/lat must be present together if defined']})
  }
}

export function extractSearchParams(query) {
  const parsedParams = extractSingleParams(normalizeQuery(query), PARAMS)

  validateLonLat(parsedParams)

  const parcelOnly = parsedParams.indexes.length === 1 && parsedParams.indexes[0] === 'parcel'

  if (parcelOnly && !('q' in parsedParams)) {
    validateStructuredSearchParams(parsedParams)
    return parsedParams
  }

  if ('q' in parsedParams && hasStructuredSearchParams(parsedParams)) {
    throw createError(400, 'Failed parsing query', {detail: ['q param and structured search cannot be used together']})
  }

  if (!('q' in parsedParams)) {
    throw createError(400, 'Failed parsing query', {detail: ['q: required param']})
  }

  if ('city' in parsedParams && parsedParams.indexes.includes('parcel')) {
    throw createError(400, 'Failed parsing query', {
      detail: ['city cannot be used with parcel index']
    })
  }

  if ('city' in parsedParams && 'citycode' in parsedParams) {
    throw createError(400, 'Failed parsing query', {detail: ['city and citycode params cannot be used together']})
  }

  if ('city' in parsedParams) {
    const matchingCities = searchCity(parsedParams.city)

    if (matchingCities.length === 0) {
      throw createError(400, 'Failed parsing query', {detail: [
        'city: No matching cities found'
      ]})
    }

    if (matchingCities.length === 1) {
      parsedParams.citycode = matchingCities[0].code
    } else {
      parsedParams.matchingCities = matchingCities
      parsedParams.q = `${parsedParams.q} ${parsedParams.city}`
    }
  }

  return parsedParams
}

export function extractReverseParams(query) {
  const parsedParams = extractSingleParams(normalizeQuery(query), PARAMS)

  validateLonLat(parsedParams)

  if (parsedParams.indexes.includes('address') && 'searchgeom' in parsedParams && !['Polygon', 'Circle'].includes(parsedParams.searchgeom.type)) {
    throw createError(400, 'Failed parsing query', {detail: [`Geometry type '${parsedParams.searchgeom.type}' not allowed for address index`]})
  }

  const hasLon = 'lon' in parsedParams
  const hasSearchGeom = 'searchgeom' in parsedParams

  if (!hasLon && !hasSearchGeom) {
    throw createError(400, 'Failed parsing query', {detail: ['At least lon/lat or searchgeom must be defined']})
  }

  if ('city' in parsedParams && parsedParams.indexes.includes('parcel')) {
    throw createError(400, 'Failed parsing query', {
      detail: ['city cannot be used with parcel index']
    })
  }

  if ('city' in parsedParams && 'citycode' in parsedParams) {
    throw createError(400, 'Failed parsing query', {detail: ['city and citycode params cannot be used together']})
  }

  if ('city' in parsedParams) {
    const matchingCities = searchCity(parsedParams.city)

    if (matchingCities.length === 0) {
      throw createError(400, 'Failed parsing query', {detail: [
        'city: No matching cities found'
      ]})
    }

    parsedParams.citycode = matchingCities.map(c => c.code)
  }

  return parsedParams
}
