import {customAlphabet} from 'nanoid'
import createError from 'http-errors'
import pFilter from 'p-filter'
import {subMinutes, isBefore} from 'date-fns'

import logger from '../../lib/logger.js'

import {hydrateObject, prepareObject} from '../util/redis.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')

const metaSchema = {
  id: 'string',
  status: 'string',
  createdAt: 'date',
  updatedAt: 'date',
  userParams: 'object',
  pipeline: 'object',
  inputFile: 'object',
  outputFile: 'object'
}

const processingSchema = {
  step: 'string',
  validationProgress: 'object',
  validationError: 'string',
  geocodingProgress: 'object',
  geocodingError: 'string',
  globalError: 'string',
  startedAt: 'date',
  finishedAt: 'date',
  heartbeat: 'date'
}

export async function createProject({redis}) {
  const id = nanoid(10)
  const token = nanoid(24)
  const status = 'idle'
  const createdAt = new Date()
  const updatedAt = new Date()
  const userParams = {maxFileSize: '50MB'}

  await redis
    .pipeline()
    .hset(`project:${id}:meta`, prepareObject({id, status, createdAt, updatedAt, userParams}))
    .set(`token:${token}`, id)
    .exec()

  return {id, status, token, createdAt, updatedAt, userParams, processing: {}}
}

export async function touchProject(id, {redis}) {
  await redis.hset(`project:${id}:meta`, prepareObject({updatedAt: new Date()}))
}

export async function checkProjectToken(id, token, {redis}) {
  if (!id || !token) {
    return false
  }

  const result = await redis.get(`token:${token}`)
  return result === id
}

export async function getProject(id, {redis}) {
  const meta = await redis.hgetall(`project:${id}:meta`)
  const processing = await redis.hgetall(`project:${id}:processing`)

  if (meta.id) {
    return {
      ...hydrateObject(meta, metaSchema),
      processing: hydrateObject(processing, processingSchema)
    }
  }
}

export async function ensureProjectStatus(id, expectedStatuses, {redis}) {
  expectedStatuses = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses]
  const status = await redis.hget(`project:${id}:meta`, 'status')

  if (!expectedStatuses.includes(status)) {
    throw createError(409, `This action requires the following statuses: ${expectedStatuses.join(', ')}. Actual status: ${status}`)
  }
}

export async function setPipeline(id, pipeline, {redis}) {
  await ensureProjectStatus(id, 'idle', {redis})
  await redis.hset(`project:${id}:meta`, prepareObject({pipeline, updatedAt: new Date()}))
}

export async function setInputFile(id, {name, size}, inputStream, {redis, storage}) {
  await ensureProjectStatus(id, 'idle', {redis})
  const objectKey = await storage.uploadFile(inputStream, 'input', size)
  const currentObjectKey = await redis.get(`project:${id}:input-obj-key`)

  if (currentObjectKey) {
    storage.deleteFile(currentObjectKey).catch(error => {
      logger.error(`Unable to delete object ${currentObjectKey} from storage: ${error.message}`)
    })
  }

  await redis.pipeline()
    .hset(`project:${id}:meta`, prepareObject({
      inputFile: {name, size},
      updatedAt: new Date()
    }))
    .set(`project:${id}:input-obj-key`, objectKey)
    .exec()
}

export async function getInputFileDownloadStream(id, {redis, storage}) {
  const objectKey = await redis.get(`project:${id}:input-obj-key`)
  return storage.createDownloadStream(objectKey)
}

export async function setOutputFile(id, filename, inputStream, {redis, storage}) {
  await ensureProjectStatus(id, 'processing', {redis})
  const objectKey = await storage.uploadFile(inputStream, 'output')
  const currentObjectKey = await redis.get(`project:${id}:output-obj-key`)

  if (currentObjectKey) {
    storage.deleteFile(currentObjectKey).catch(error => {
      logger.error(`Unable to delete object ${currentObjectKey} from storage: ${error.message}`)
    })
  }

  const fileSize = await storage.getFileSize(objectKey)

  await redis.pipeline()
    .hset(`project:${id}:meta`, prepareObject({
      outputFile: {name: filename, size: fileSize, token: nanoid(24)},
      updatedAt: new Date()
    }))
    .set(`project:${id}:output-obj-key`, objectKey)
    .exec()
}

export async function getOutputFileDownloadStream(id, {redis, storage}) {
  const objectKey = await redis.get(`project:${id}:output-obj-key`)
  return storage.createDownloadStream(objectKey)
}

export async function askProcessing(id, {redis}) {
  await ensureProjectStatus(id, 'idle', {redis})

  const keys = await redis.hkeys(`project:${id}:meta`)

  if (!keys.includes('inputFile')) {
    throw createError(409, 'No input file defined')
  }

  if (!keys.includes('pipeline')) {
    throw createError(409, 'No data pipeline defined')
  }

  const ok = await redis.set(`project:${id}:processing-asked`, 1, 'NX')

  if (ok) {
    await redis.pipeline()
      .hset(`project:${id}:meta`, prepareObject({
        status: 'waiting',
        updatedAt: new Date()
      }))
      .del(`project:${id}:processing-asked`)
      .rpush('waiting-queue', id)
      .exec()
  }
}

export async function processNext({redis}) {
  const projectId = await redis.lpop('waiting-queue')

  if (!projectId) {
    return
  }

  await redis.pipeline()
    .sadd('processing-list', projectId)
    .hset(`project:${projectId}:meta`, prepareObject({status: 'processing', updatedAt: new Date()}))
    .hset(`project:${projectId}:processing`, prepareObject({step: 'starting', startedAt: new Date()}))
    .exec()

  return projectId
}

export async function updateProcessing(id, changes, {redis}) {
  await ensureProjectStatus(id, 'processing', {redis})
  await redis.hset(`project:${id}:processing`, prepareObject({...changes, heartbeat: new Date()}))
}

export async function resetProcessing(id, {redis}) {
  await redis
    .pipeline()
    .del(`project:${id}:processing-asked`)
    .lrem('waiting-queue', 0, id)
    .srem('processing-list', id)
    .hdel(`project:${id}:meta`, 'outputFile')
    .hset(`project:${id}:meta`, prepareObject({status: 'idle', updatedAt: new Date()}))
    .del(`project:${id}:processing`)
    .del(`project:${id}:output-obj-key`)
    .exec()
}

export async function endProcessing(id, error, {redis}) {
  await ensureProjectStatus(id, 'processing', {redis})

  await redis
    .pipeline()
    .srem('processing-list', id)
    .hset(`project:${id}:meta`, prepareObject({status: error ? 'failed' : 'completed', updatedAt: new Date()}))
    .hset(`project:${id}:processing`, prepareObject({step: error ? 'failed' : 'completed', finishedAt: new Date(), globalError: error}))
    .hdel(`project:${id}:processing`, 'heartbeat')
    .exec()
}

export async function getStalledProjects({redis}) {
  const processingProjects = await redis.smembers('processing-list')

  return pFilter(processingProjects, async projectId => {
    const heartbeat = await redis.hget(`project:${projectId}:processing`, 'heartbeat')

    if (!heartbeat) {
      return false
    }

    return isBefore(new Date(heartbeat), subMinutes(new Date(), 2))
  })
}

export async function deleteProject(id, {redis, storage}) {
  await ensureProjectStatus(id, ['idle', 'completed', 'aborted', 'failed'], {redis})

  const inputFileObjectKey = await redis.get(`project:${id}:input-obj-key`)
  if (inputFileObjectKey) {
    storage.deleteFile(inputFileObjectKey).catch(error => {
      logger.error(`Unable to delete object ${inputFileObjectKey} from storage: ${error.message}`)
    })
  }

  const outputFileObjectKey = await redis.get(`project:${id}:output-obj-key`)
  if (outputFileObjectKey) {
    storage.deleteFile(outputFileObjectKey).catch(error => {
      logger.error(`Unable to delete object ${outputFileObjectKey} from storage: ${error.message}`)
    })
  }

  await redis.pipeline()
    .del(`project:${id}:processing-asked`) // Not necessary
    .lrem('waiting-queue', 0, id) // Not necessary
    .srem('processing-list', id) // Not necessary
    .del(`project:${id}:meta`)
    .del(`project:${id}:input-obj-key`)
    .del(`project:${id}:output-obj-key`)
    .del(`project:${id}:processing`)
    .exec()
}
