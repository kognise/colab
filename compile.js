const debug = require('debug')('colab:compile')
const browserify = require('browserify')
const envify = require('loose-envify')
const { minify } = require('uglify-js')
const { transformAsync } = require('@babel/core')
const PassThroughStream = require('stream').PassThrough

function bundleAsync(file, env, config) {
  const b = browserify(file, config)
  b.transform(envify, {
    NODE_ENV: 'production',
    DEBUG: 'xx',
    ...env
  })

  const stream = new PassThroughStream()
  b.bundle().pipe(stream)
  return new Promise((resolve, reject) => {
    let buffer = ''
    stream.on('data', (data) => {
      buffer += data.toString()
    }).once('end', () => {
      resolve(buffer)
    }).once('error', (error) => {
      reject(new Error(error))
    })
  })
}

module.exports = (file, env) => {
  debug(`compiling ${file}`)
  return bundleAsync(file, env).then((raw) => {
    debug('running code through babel')
    return transformAsync(raw, { presets: [ '@babel/env' ] })
  }).then(({ code }) => {
    debug('minifying code')
    const minified = minify(code)
    if (minified.error) {
      debug(`error minifying code: ${minified.error}`)
      return ''
    } else {
      debug('done!')
      return minified.code
    }
    return code
  })
}