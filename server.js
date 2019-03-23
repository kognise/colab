const debug = require('debug')('colab:server')
const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const compile = require('./compile')
const fs = require('fs')

let content = ''
let connections = 0
let timeouts = {}
const ips = []
const ratelimit = 1000 * 60 * 5

function loadStore() {
  debug('loading from store')
  fs.readFile('content.txt', (error, data) => {
    if (error) {
      debug(`error loading content from store, disregarding: ${error.toString()}`)
    } else {
      content = data.toString()
      debug('loaded content from store')
    }
  })
  fs.readFile('timeouts.json', (error, data) => {
    if (error) {
      debug(`error loading timeouts from store, disregarding: ${error.toString()}`)
    } else {
      debug('loaded timeouts from store, parsing json')
      json = data.toString()
      try {
        timeouts = JSON.parse(json)
        debug('done parsing')
      } catch(error) {
        debug(`error parsing json, disregarding: ${error.toString()}`)
      }
    }
  })
}

function updateContentStore() {
  debug('updating content store')
  fs.writeFile('content.txt', content, (error) => {
    if (error) {
      debug(`error updating content store: ${error.toString()}`)
    } else {
      debug('updated content store')
    }
  })
}

function updateTimeoutStore() {
  debug('updating timeout store')
  fs.writeFile('timeouts.json', JSON.stringify(timeouts), (error) => {
    if (error) {
      debug(`error updating timeout store: ${error.toString()}`)
    } else {
      debug('updated timeout store')
    }
  })
}

app.get('/', (req, res) => {
  res.sendFile('client.html', { root: __dirname })
})

app.get('/styles.css', (req, res) => {
  res.sendFile('client.css', { root: __dirname })
})

io.on('connection', (socket) => {
  const ip = socket.client.conn.remoteAddress
  if (ips.includes(ip)) {
    socket.emit('connections', connections)
    socket.emit('blocked', 'ip')
    debug('blocked a duplicate connection')
    return
  }
  ips.push(ip)

  connections++
  io.emit('connections', connections)
  debug(`${socket.id} connected`)
  if (!timeouts[ip]) {
    debug('ip wasn\'t in timeouts, saving')
    timeouts[ip] = 0
    updateTimeoutStore()
  } else {
    socket.emit('ratelimit', ratelimit - (Date.now() - timeouts[ip]))
  }

  socket.on('update', (newContent) => {
    debug('received content update')

    const timeSinceUpdate = Date.now() - timeouts[ip]
    if (Math.abs(newContent.length - content.length) > 1) {
      socket.emit('too long')
      debug('edit too long')
    }
    if (
      newContent.length - content.length !== 0
      && timeSinceUpdate > ratelimit
      && Math.abs(newContent.length - content.length) <= 1
    ) {
      timeouts[ip] = Date.now()
      content = newContent
      updateTimeoutStore()
      updateContentStore()
    } else {
      socket.emit('ratelimit', ratelimit - timeSinceUpdate)
    }
    
    io.emit('update', { content, timestamp: Date.now() })
  })

  socket.on('disconnect', () => {
    debug(`${socket.id} disconnected`)
    connections--
    ips.splice(ips.indexOf(ip), 1)
    io.emit('connections', connections)
  })

  socket.emit('update', { content, timestamp: Date.now() })
})

compile('client.js', { RATELIMIT: ratelimit }).then((clientCode) => {
  app.get('/script.js', (req, res) => {
    res.send(clientCode)
  })
  
  loadStore()
  http.listen(3000, () => debug('listening on port 3000', ))
})