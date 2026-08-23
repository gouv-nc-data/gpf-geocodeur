import 'global-agent/bootstrap.js'

import process from 'node:process'
import path from 'node:path'
import {Buffer} from 'node:buffer'
import {createWriteStream} from 'node:fs'
import {mkdir, open, rename, rm, stat} from 'node:fs/promises'
import {pipeline} from 'node:stream/promises'

import got from 'got'
import pRetry, {AbortError} from 'p-retry'

import logger from './logger.js'

const GZIP_MAGIC = Buffer.from([0x1F, 0x8B])

const DOWNLOAD_ATTEMPTS = process.env.DOWNLOAD_ATTEMPTS
  ? Number.parseInt(process.env.DOWNLOAD_ATTEMPTS, 10)
  : 4

const DOWNLOAD_TIMEOUT = process.env.DOWNLOAD_TIMEOUT
  ? Number.parseInt(process.env.DOWNLOAD_TIMEOUT, 10)
  : 60_000

// Un code 4xx ne sera pas réparé par une nouvelle tentative : on abandonne
// tout de suite, sauf pour les codes qui signalent explicitement un réessai.
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429])

export function isRetryableError(error) {
  const statusCode = error.response?.statusCode

  if (!statusCode) {
    // Erreur réseau, DNS, proxy, timeout : ça vaut le coup de réessayer
    return true
  }

  if (statusCode >= 400 && statusCode < 500) {
    return RETRYABLE_STATUS_CODES.has(statusCode)
  }

  return true
}

/**
 * Télécharge `url` vers `destPath` de façon atomique : le transfert se fait dans
 * un fichier `.part` qui n'est renommé qu'après validation. En cas d'échec,
 * `destPath` n'est jamais modifié.
 */
export async function downloadFile(url, destPath, options = {}) {
  const {
    attempts = DOWNLOAD_ATTEMPTS,
    timeout = DOWNLOAD_TIMEOUT,
    minBytes = 1,
    expectGzip = false,
    minTimeout
  } = options

  await mkdir(path.dirname(destPath), {recursive: true})

  const retryOptions = {
    retries: attempts - 1,
    onFailedAttempt(error) {
      logger.error(`Échec de la tentative ${error.attemptNumber}/${attempts} sur ${url} : ${error.message}`)

      if (error.retriesLeft > 0) {
        logger.log(`Nouvelle tentative (${error.retriesLeft} restante(s))…`)
      }
    }
  }

  // Ne surcharger le backoff par défaut que si une valeur est fournie :
  // passer minTimeout: undefined écraserait la valeur par défaut de `retry`.
  if (minTimeout !== undefined) {
    retryOptions.minTimeout = minTimeout
  }

  return pRetry(
    () => downloadFileOnce(url, destPath, {timeout, minBytes, expectGzip}),
    retryOptions
  )
}

async function downloadFileOnce(url, destPath, {timeout, minBytes, expectGzip}) {
  const partPath = `${destPath}.part`

  await rm(partPath, {force: true})

  // Avec `decompress: false`, on écrit les octets tels quels, sans que got ne
  // décompresse un éventuel Content-Encoding: gzip posé par un proxy.
  const downloadStream = got.stream(url, {
    decompress: false,
    retry: {limit: 0},
    timeout: {response: timeout, socket: timeout}
  })

  let contentLength
  let transferred = 0
  let progressInterval

  downloadStream.once('response', response => {
    const rawContentLength = response.headers['content-length']

    if (rawContentLength !== undefined) {
      contentLength = Number.parseInt(rawContentLength, 10)
    }

    logger.log(`Téléchargement de ${url} — HTTP ${response.statusCode}${contentLength ? `, ${contentLength} octets attendus` : ''}`)
  })

  downloadStream.on('downloadProgress', progress => {
    transferred = progress.transferred
  })

  try {
    progressInterval = setInterval(() => {
      const percentPart = contentLength ? ` / ${((transferred / contentLength) * 100).toFixed(1)}%` : ''
      logger.log(`Transféré : ${transferred}${percentPart}`)
    }, 5000)

    await pipeline(downloadStream, createWriteStream(partPath))
  } catch (error) {
    await rm(partPath, {force: true})
    throw wrapDownloadError(error, url)
  } finally {
    clearInterval(progressInterval)
  }

  try {
    const {size} = await stat(partPath)

    if (contentLength !== undefined && size !== contentLength) {
      throw new Error(`Téléchargement tronqué de ${url} : ${size} octets reçus, ${contentLength} attendus`)
    }

    if (size < minBytes) {
      throw new Error(`Fichier téléchargé depuis ${url} trop petit : ${size} octets (minimum ${minBytes})`)
    }

    if (expectGzip) {
      await assertGzipMagic(partPath, url)
    }
  } catch (error) {
    await rm(partPath, {force: true})
    throw error
  }

  await rename(partPath, destPath)

  const {size} = await stat(destPath)

  return {path: destPath, size}
}

function wrapDownloadError(error, url) {
  const statusCode = error.response?.statusCode
  const detail = statusCode
    ? `HTTP ${statusCode}${error.response.statusMessage ? ` ${error.response.statusMessage}` : ''}`
    : (error.code || error.message)

  const wrappedError = new Error(`Échec du téléchargement de ${url} => ${detail}`)
  wrappedError.cause = error

  return isRetryableError(error)
    ? wrappedError
    : new AbortError(wrappedError)
}

/**
 * Vérifie que le fichier commence bien par la signature gzip. Attrape le cas
 * courant où le serveur (ou le proxy) renvoie une page d'erreur HTML en 200.
 */
async function assertGzipMagic(filePath, url) {
  const fileHandle = await open(filePath)

  try {
    const {buffer, bytesRead} = await fileHandle.read(Buffer.alloc(2), 0, 2, 0)

    if (bytesRead < 2 || !buffer.equals(GZIP_MAGIC)) {
      throw new Error(`Le fichier téléchargé depuis ${url} n'est pas une archive gzip`)
    }
  } finally {
    await fileHandle.close()
  }
}
