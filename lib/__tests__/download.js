import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {gzipSync} from 'node:zlib'
import {Buffer} from 'node:buffer'
import test from 'ava'
import nock from 'nock'
import {downloadFile, isRetryableError} from '../download.js'

const GZIPPED_BODY = gzipSync(Buffer.from('{"id":"1"}\n'.repeat(500)))

async function createTmpDir() {
  return mkdtemp(path.join(tmpdir(), 'download-test-'))
}

test('isRetryableError / erreur réseau', t => {
  t.true(isRetryableError(new Error('socket hang up')))
})

test('isRetryableError / 4xx définitif', t => {
  t.false(isRetryableError({response: {statusCode: 404}}))
  t.false(isRetryableError({response: {statusCode: 403}}))
})

test('isRetryableError / 4xx et 5xx réessayables', t => {
  t.true(isRetryableError({response: {statusCode: 429}}))
  t.true(isRetryableError({response: {statusCode: 408}}))
  t.true(isRetryableError({response: {statusCode: 502}}))
})

test('downloadFile / succès', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  nock('http://ban').get('/ok.gz').reply(200, GZIPPED_BODY)

  const destPath = path.join(tmpDir, 'ok.gz')
  const result = await downloadFile('http://ban/ok.gz', destPath, {expectGzip: true})

  t.is(result.path, destPath)
  t.is(result.size, GZIPPED_BODY.length)
  t.deepEqual(await readFile(destPath), GZIPPED_BODY)
})

test('downloadFile / 404 : pas de nouvelle tentative, destination intacte', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  let calls = 0
  nock('http://ban').get('/missing.gz').times(4).reply(() => {
    calls++
    return [404, 'Not Found']
  })

  const destPath = path.join(tmpDir, 'missing.gz')
  await writeFile(destPath, 'index précédent')

  const error = await t.throwsAsync(
    downloadFile('http://ban/missing.gz', destPath, {expectGzip: true, minTimeout: 0})
  )

  t.true(error.message.includes('HTTP 404'))
  t.is(calls, 1, 'un 404 ne doit pas être réessayé')
  t.is(await readFile(destPath, 'utf8'), 'index précédent', 'la destination ne doit pas être touchée')
})

test('downloadFile / 500 puis succès', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  let calls = 0
  nock('http://ban').get('/flaky.gz').times(3).reply(() => {
    calls++
    return calls === 1 ? [502, 'Bad Gateway'] : [200, GZIPPED_BODY]
  })

  const destPath = path.join(tmpDir, 'flaky.gz')
  const result = await downloadFile('http://ban/flaky.gz', destPath, {expectGzip: true, minTimeout: 0})

  t.is(calls, 2)
  t.is(result.size, GZIPPED_BODY.length)
})

test('downloadFile / réponse non gzip rejetée', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  const htmlErrorPage = '<html><body>Service indisponible</body></html>'.repeat(50)
  nock('http://ban').get('/html.gz').times(2).reply(200, htmlErrorPage)

  const destPath = path.join(tmpDir, 'html.gz')

  const error = await t.throwsAsync(
    downloadFile('http://ban/html.gz', destPath, {expectGzip: true, attempts: 2, minTimeout: 0})
  )

  t.true(error.message.includes('n\'est pas une archive gzip'))
  await t.throwsAsync(readFile(destPath), {code: 'ENOENT'})
})

test('downloadFile / fichier trop petit rejeté', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  nock('http://ban').get('/tiny.gz').times(2).reply(200, gzipSync(Buffer.from('x')))

  const destPath = path.join(tmpDir, 'tiny.gz')

  const error = await t.throwsAsync(
    downloadFile('http://ban/tiny.gz', destPath, {expectGzip: true, minBytes: 1024, attempts: 2, minTimeout: 0})
  )

  t.true(error.message.includes('trop petit'))
  await t.throwsAsync(readFile(destPath), {code: 'ENOENT'})
})

test('downloadFile / aucun fichier .part laissé derrière', async t => {
  const tmpDir = await createTmpDir()
  t.teardown(() => rm(tmpDir, {recursive: true, force: true}))

  nock('http://ban').get('/missing2.gz').times(2).reply(404, 'Not Found')

  const destPath = path.join(tmpDir, 'missing2.gz')

  await t.throwsAsync(downloadFile('http://ban/missing2.gz', destPath, {minTimeout: 0}))
  await t.throwsAsync(readFile(`${destPath}.part`), {code: 'ENOENT'})
})
