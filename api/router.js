import process from 'node:process'
import path from 'node:path'
import {mkdir} from 'node:fs/promises'
import express from 'express'
import cors from 'cors';
import multer from 'multer'

import w from '../lib/w.js'
import errorHandler from '../lib/error-handler.js'
import {validateBatchPayload} from '../lib/batch.js'
import {GEOCODE_INDEXES} from '../lib/config.js'

import {createIndexes} from './indexes/index.js'
import search from './operations/search.js'
import reverse from './operations/reverse.js'
import batch from './operations/batch.js'
import autocomplete from './operations/autocomplete.js'
import {extractSearchParams, extractReverseParams} from './params/base.js'
import {extractParams as extractAutocompleteParams} from './params/autocomplete.js'
import computeGeocodeCapabilities from './capabilities/geocode.js'
import computeAutocompleteCapabilities from './capabilities/autocomplete.js'
import {editConfig} from './open-api/edit-config.js'
import {computeHtmlPage} from './open-api/swagger-ui.js'

import { esri_responses, getSearchParamsInEsriGeocode, searchResult2Candidates, getSuggestsParamsInEsriGeocode, getReverseParamsInEsriGeocode, searchResult2Suggests, reverseResult2Adress, getOutSr }from './esriGeocode.js';

import {csv, parseAndValidate} from './csv/index.js'

const DEFAULT_UPLOAD_DIR = 'uploads/'

const {API_ROOT_REDIRECTION} = process.env

export default async function createRouter(options = {}) {
  const uploadDir = options.uploadDir || DEFAULT_UPLOAD_DIR
  await mkdir(uploadDir, {recursive: true})

  const router = new express.Router()

  // Activer CORS pour toutes les routes
  router.use(cors());

  const upload = multer({dest: uploadDir, limits: {fileSize: 50 * 1024 * 1024}}) // 50MB

  const indexes = options.customIndexes || createIndexes(options.indexes || GEOCODE_INDEXES)


  /******************************************************************************************************************/
  /****************************** DEBUT fake Esri GeocodeServer *****************************************************/
  /***************************** Esri geocoder fake arcgis server info */
  const georepInfoHandle = async (req, res) => {
    res.send(esri_responses.info)
  }
  router.get('/arcgis/rest/info', w(georepInfoHandle));
  router.get('/rest/info', w(georepInfoHandle));

  /** Esri geocoder fake arcgis server rest/services */
  const georepServicesHandle = async (req, res) => {
    res.send(esri_responses.services)
  }
  router.get('/arcgis/rest/services', w(georepServicesHandle));
  router.get('/rest/services', w(georepServicesHandle));


  /***************************** Esri geocoder fake service */
  const georepGeocodeServiceHandler = async (req, res) => {
    res.send(esri_responses.service)
  }
  router.get('/arcgis/rest/services/localisations/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/rest/services/localisations/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/arcgis/rest/services/adresses/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/rest/services/adresses/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/arcgis/rest/services/cadastre/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/rest/services/cadastre/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/arcgis/rest/services/pois/GeocodeServer', w(georepGeocodeServiceHandler));
  router.get('/rest/services/pois/GeocodeServer', w(georepGeocodeServiceHandler));

  /***************************** Esri geocoder fake service : findAddressCandidates (=search)*/
  const georepServiceFindAddressCandidatesHandler = async (req, res) => {
    const outWkid = getOutSr(req.query);
    const params = getSearchParamsInEsriGeocode(req.query);
    if(req.url.indexOf("/localisations/GeocodeServer") > 1){
      // Rien
    }
    else if(req.url.indexOf("/adresses/GeocodeServer") > 1){
      params.indexes = ['address'];
    }
    else if(req.url.indexOf("/cadastre/GeocodeServer") > 1){
      params.indexes = ['cadastre'];
    }
    else if(req.url.indexOf("/pois/GeocodeServer") > 1){
      params.indexes = ['poi'];
    }
    const results = await search(params, {indexes});
    res.send(searchResult2Candidates(results, outWkid));
  }
  router.get('/arcgis/rest/services/localisations/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/rest/services/localisations/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/arcgis/rest/services/adresses/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/rest/services/adresses/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/arcgis/rest/services/cadastre/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/rest/services/cadastre/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/arcgis/rest/services/pois/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));
  router.get('/rest/services/pois/GeocodeServer/findAddressCandidates', w(georepServiceFindAddressCandidatesHandler));

  /***************************** Esri geocoder fake service : suggest (=completion)*/
  const georepServiceSuggestHandler = async (req, res) => {
    const params = getSuggestsParamsInEsriGeocode(req.query);
    if(req.url.indexOf("/localisations/GeocodeServer") > 1){
      // Rien
    }
    else if(req.url.indexOf("/adresses/GeocodeServer") > 1){
      params.type = ['StreetAddress'];
    }
    else if(req.url.indexOf("/cadastre/GeocodeServer") > 1){
      params.type = ['Cadastre'];
    }
    else if(req.url.indexOf("/pois/GeocodeServer") > 1){
      params.type = ['PositionOfInterest'];
    }

    try {
      const results = await autocomplete(params, {indexes})
      res.send(searchResult2Suggests(results))
    } catch (error) {
      res.send({
        status: 'Error',
        error: error.message
      })
    }
  }
  router.get('/arcgis/rest/services/localisations/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('rest/services/localisations/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('/arcgis/rest/services/adresses/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('rest/services/adresses/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('/arcgis/rest/services/cadastre/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('rest/services/cadastre/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('/arcgis/rest/services/pois/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  router.get('rest/services/pois/GeocodeServer/suggest', w(georepServiceSuggestHandler));
  /****************************** FIN fake Esri GeocodeServer *******************************************************/
  /******************************************************************************************************************/
  /***************************** Esri geocoder fake service : reverseGeocode (=reverse)*/
  const georepServiceReverseHandler = async (req, res) => {
    const params = getReverseParamsInEsriGeocode(req.query);
    const outWkid = getOutSr(req.query);
    if(req.url.indexOf("/localisations/GeocodeServer") > 1){
      // Rien
    }
    else if(req.url.indexOf("/adresses/GeocodeServer") > 1){
      params.indexes = ['address'];
    }
    else if(req.url.indexOf("/cadastre/GeocodeServer") > 1){
      params.indexes = ['cadastre'];
    }
    else if(req.url.indexOf("/pois/GeocodeServer") > 1){
      params.indexes = ['poi'];
    }
    const results = await reverse(params, {indexes});
    res.send(reverseResult2Adress(results, outWkid));
  }
  router.get('/arcgis/rest/services/localisations/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('rest/services/localisations/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('/arcgis/rest/services/adresses/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('rest/services/adresses/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('/arcgis/rest/services/cadastre/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('rest/services/cadastre/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('/arcgis/rest/services/pois/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  router.get('rest/services/pois/GeocodeServer/reverseGeocode', w(georepServiceReverseHandler));
  /****************************** FIN fake Esri GeocodeServer *******************************************************/
  /******************************************************************************************************************/


  router.get('/search', w(async (req, res) => {
    const params = extractSearchParams(req.query)
    const results = await search(params, {indexes})
    res.send({
      type: 'FeatureCollection',
      features: results
    })
  }))

  router.get('/reverse', w(async (req, res) => {
    const params = extractReverseParams(req.query)
    const results = await reverse(params, {indexes})
    res.send({
      type: 'FeatureCollection',
      features: results
    })
  }))

  /*router.post('/batch', express.json(), w(async (req, res) => {
    const payload = req.body

    validateBatchPayload(payload, new Set(['search', 'reverse']))

    const results = await batch(payload, {indexes})
    res.send({results})
  }))

  router.post(
    '/search/csv',
    upload.single('data'),
    w(parseAndValidate()),
    w(csv({indexes, operation: 'search'}))
  )

  router.post(
    '/reverse/csv',
    upload.single('data'),
    w(parseAndValidate()),
    w(csv({indexes, operation: 'reverse'}))
  )*/

  router.get('/completion', w(async (req, res) => {
    const params = extractAutocompleteParams(req.query)
    try {
      const results = await autocomplete(params, {indexes})
      res.send({
        status: 'OK',
        results
      })
    } catch (error) {
      res.send({
        status: 'Error',
        error: error.message
      })
    }
  }))

  router.get('/getCapabilities', w(async (req, res) => {
    const capabilities = await computeGeocodeCapabilities()
    res.send(capabilities)
  }))

  router.get('/completion/getCapabilities', w(async (req, res) => {
    const capabilities = await computeAutocompleteCapabilities()
    res.send(capabilities)
  }))

  router.get('/openapi.yaml', w(async (req, res) => {
    const yamlPath = path.resolve('./config/open-api/geocode.yaml')
    const editedConfig = await editConfig(yamlPath, process.env.API_URL)

    res
      .set('Content-Type', 'text/yaml')
      .attachment('geocode.yaml')
      .send(editedConfig)
  }))

  router.get('/openapi', (req, res) => {
    const page = computeHtmlPage({pageTitle: 'API de géocodage', openApiDefinitionUrl: 'openapi.yaml'})
    res.type('html').send(page)
  })

  router.get('/completion/openapi.yaml', w(async (req, res) => {
    const yamlPath = path.resolve('./config/open-api/completion.yaml')
    const editedConfig = await editConfig(yamlPath, process.env.API_URL)

    res
      .set('Content-Type', 'text/yaml')
      .attachment('completion.yaml')
      .send(editedConfig)
  }))

  router.get('/completion/openapi', (req, res) => {
    const page = computeHtmlPage({pageTitle: 'API de d’auto-complétion', openApiDefinitionUrl: 'openapi.yaml'})
    res.type('html').send(page)
  })

  router.get('/', (req, res) => {
    if (API_ROOT_REDIRECTION) {
      return res.redirect(API_ROOT_REDIRECTION)
    }

    res.sendStatus(404)
  })

  router.use('/demo', express.static(path.join(process.cwd(), 'api', 'demo')));  

  router.use(errorHandler)

  return router
}
