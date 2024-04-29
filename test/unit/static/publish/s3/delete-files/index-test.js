let test = require('tape')
let awsLite = require('@aws-lite/client')
let { join, sep } = require('path')
let cwd = process.cwd()
let filePath = join(cwd, 'src', 'static', 'publish', 's3', 'delete-files')
let sut = require(filePath)

let aws
let files = [
  'index.html',
  'folder/something.json',
  'index.js',
]
let localFiles = arr => arr.map(f => join(cwd, 'public', f.replace('/', sep)))
let noop = () => {}
let defaultParams = () => {
  return {
    aws,
    Bucket: 'a-bucket',
    files: localFiles(files),
    fingerprint: false,
    folder: 'public',
    ignore: [],
    inventory: { inv: { _project: { cwd } } },
    prefix: undefined,
    region: 'us-west-1',
    staticManifest: {},
    update: { status: noop, raw: noop },
  }
}
let filesOnS3 = () => ({ Contents: files.map(Key => ({ Key })) })
let s3DeleteObjects = params => ({ Deleted: params.Delete.Objects })



function reset () {
  awsLite.testing.reset()
}

test('Set up env', async t => {
  t.plan(2)
  t.ok(sut, 'S3 file delete module is present')

  aws = await awsLite({ region: 'us-west-2', plugins: [ import('@aws-lite/s3') ] })
  awsLite.testing.enable()
  t.ok(awsLite.testing.isEnabled(), 'AWS client testing enabled')
})

test('Do not prune if there is nothing to prune', t => {
  t.plan(2)

  let params = defaultParams()
  awsLite.testing.mock('S3.ListObjectsV2', filesOnS3())
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.notOk(delObjCalls, 'S3.DeleteObjects not called')
    reset()
  })
})

test('Prune if there is something to prune', t => {
  t.plan(3)

  let params = defaultParams()
  params.files.pop() // Create a pruning opportunity
  awsLite.testing.mock('S3.ListObjectsV2', filesOnS3())
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    t.equal(delObjCalls[0].request.Delete.Objects[0].Key, files[files.length - 1], `Pruned correct file: ${files[files.length - 1]}`)
    reset()
  })
})

test('Prune respects ignore', t => {
  t.plan(2)

  let params = defaultParams()
  params.files.pop() // Create a pruning opportunity
  awsLite.testing.mock('S3.ListObjectsV2', filesOnS3())
  params.ignore = [ 'index.js' ]
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.notOk(delObjCalls, 'S3.DeleteObjects not called')
    reset()
  })
})

test('Prune does not prefix if prefix is not set', t => {
  t.plan(3)

  let params = defaultParams()
  params.files.pop() // Create a pruning opportunity
  awsLite.testing.mock('S3.ListObjectsV2', filesOnS3())
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.notOk(listObjCalls[0].request.Prefix, 'S3.ListObjectsV2 not called with prefix')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    reset()
  })
})

test('Prune respects prefix setting', t => {
  t.plan(4)

  let params = defaultParams()
  let prefix = 'a-prefix'
  params.prefix = prefix
  params.files.pop() // Create a pruning opportunity
  awsLite.testing.mock('S3.ListObjectsV2', { Contents: files.map(Key => ({ Key: `${prefix}/${Key}` })) })
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.ok(listObjCalls[0].request.Prefix, 'S3.ListObjectsV2 called with prefix')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    let file = `${prefix}/${files[files.length - 1]}`
    t.equal(delObjCalls[0].request.Delete.Objects[0].Key, file, `Pruned correct file: ${file}`)
    reset()
  })
})

test('Prune respects fingerprint setting', t => {
  t.plan(3)

  let params = defaultParams()
  params.fingerprint = true
  params.staticManifest = {
    'index.html': 'index-df330f3f12.html',
    'folder/something.json': 'folder/something-df330f3f12.json',
  }
  params.files.pop() // Create a pruning opportunity
  let pruneThis = 'index-df330f3f12.js'
  awsLite.testing.mock('S3.ListObjectsV2', { Contents: [
    { Key: 'index-df330f3f12.html' },
    { Key: 'folder/something-df330f3f12.json' },
    { Key: pruneThis },
  ] })
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    t.equal(delObjCalls[0].request.Delete.Objects[0].Key, pruneThis, `Pruned correct file: ${pruneThis}`)
    reset()
  })
})

test('Prune respects both prefix & fingerprint settings together', t => {
  t.plan(3)

  let params = defaultParams()
  let prefix = 'a-prefix'
  params.prefix = prefix
  params.fingerprint = true
  params.staticManifest = {
    'index.html': 'index-df330f3f12.html',
    'folder/something.json': 'folder/something-df330f3f12.json',
  }
  params.files.pop() // Create a pruning opportunity
  let pruneThis = `${prefix}/index-df330f3f12.js`
  awsLite.testing.mock('S3.ListObjectsV2', { Contents: [
    { Key: `${prefix}/index-df330f3f12.html` },
    { Key: `${prefix}/folder/something-df330f3f12.json` },
    { Key: pruneThis },
  ] })
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    t.equal(delObjCalls[0].request.Delete.Objects[0].Key, pruneThis, `Pruned correct file: ${pruneThis}`)
    reset()
  })
})

test('Prune respects both prefix & fingerprint settings together in nested folders', t => {
  t.plan(3)

  let params = defaultParams()
  let prefix = 'a-prefix'
  params.prefix = prefix
  params.files = [
    'index.html',
    'a-folder/something.json',
  ]
  params.fingerprint = true
  params.staticManifest = {
    'index.html': 'index-df330f3f12.html',
    'a-folder/something.json': 'a-folder/something-df330f3f12.json',
  }
  let pruneThis = `${prefix}/a-folder/index-df330f3f12.js`
  awsLite.testing.mock('S3.ListObjectsV2', { Contents: [
    { Key: `${prefix}/index-df330f3f12.html` },
    { Key: `${prefix}/a-folder/something-df330f3f12.json` },
    { Key: pruneThis },
  ] })
  awsLite.testing.mock('S3.DeleteObjects', s3DeleteObjects)
  sut(params, err => {
    if (err) t.fail(err)
    let listObjCalls = awsLite.testing.getAllRequests('S3.ListObjectsV2')
    let delObjCalls = awsLite.testing.getAllRequests('S3.DeleteObjects')
    t.equal(listObjCalls.length, 1, 'S3.ListObjectsV2 called once')
    t.equal(delObjCalls.length, 1, 'S3.DeleteObjects called once')
    t.equal(delObjCalls[0].request.Delete.Objects[0].Key, pruneThis, `Pruned correct file: ${pruneThis}`)
    reset()
  })
})

test('Teardown', t => {
  t.plan(1)
  awsLite.testing.disable()
  t.notOk(awsLite.testing.isEnabled(), 'Done')
})
