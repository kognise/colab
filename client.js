localStorage.setItem('debug', process.env.DEBUG)
const debug = require('debug')('colab:client')
const Cookie = require('js-cookie')
const ms = require('ms')

debug('connecting...')
const io = require('socket.io-client')()
debug('probably connected')

const ratelimitArea = document.getElementById('ratelimit')
const connectionsArea = document.getElementById('connections')
const warningsArea = document.getElementById('warnings')
const contentArea = document.getElementById('content')

let oldContent = ''
let latestUpdate = 0
let currentRatelimit = 0
let firstUpdate = false
let cursorPosition = 0

function updateRatelimit() {
  ratelimitArea.innerHTML = currentRatelimit <= 0 ? `
    <span class='big'>You can now make a change</span>
    <span class='small'>Ready</span>
  ` : `
    <span class='big'>${ms(currentRatelimit, { long: true })} until your next change</span>
    <span class='small'>${ms(currentRatelimit)} left</span>
  `
}

function createWarningElement(warning) {
  const element = document.createElement('li')
  element.innerText = warning
  return element
}

function displayWarning(warning) {
  const element = createWarningElement(warning)
  warningsArea.appendChild(element)
  setTimeout(() => {
    element.style.animation = 'fade-out 500ms'
    element.addEventListener('animationend', () => {
      element.remove()
    })
  }, 1600)
}

io.on('blocked', (reason) => {
  debug(`blocked, reason ${reason}`)
  contentArea.remove()
  document.getElementById('info').remove()
  document.getElementById('primer').remove()
  document.getElementById('blocked').style.display = 'block'
})

io.on('update', ({ content, timestamp }) => {
  if (timestamp < latestUpdate) {
    debug('disregarding old update')
    return
  }
  if (!firstUpdate) {
    firstUpdate = true
    if (Cookie.get('primed')) {
      contentArea.style.display = 'block'
      contentArea.focus()
    }
  }

  latestUpdate = Date.now()
  contentArea.value = content
  contentArea.setSelectionRange(cursorPosition, cursorPosition)
  oldContent = content
  debug(`updated content, timestamp ${timestamp}`)
})

io.on('ratelimit', (remaining) => {
  currentRatelimit = remaining
  updateRatelimit()
  debug(`ratelimit, ${remaining}ms remaining`)
})

io.on('too long', () => {
  displayWarning('Edit too long!')
  debug('edit too long')
})

io.on('connections', (connections) => {
  connectionsArea.innerHTML = `
    ${connections} ${connections === 1 ? 'person' : 'people'}
    <span class='big'>online</span>
  `
})

function checkCursorPosition() {
  if (cursorPosition === contentArea.selectionStart) return
  debug(`updating cursor position from ${cursorPosition} to ${contentArea.selectionStart}`)
  cursorPosition = contentArea.selectionStart
}
contentArea.addEventListener('keyup', checkCursorPosition)
contentArea.addEventListener('click', checkCursorPosition)
contentArea.addEventListener('focus', checkCursorPosition)

contentArea.addEventListener('keyup', (event) => {
  if (contentArea.value === oldContent) {
    debug(`no edits made, disregarding ${event.key}`)
    return
  }
  if (!firstUpdate) {
    debug(`haven't received first update, disregarding ${event.key}`)
    return
  }
  if (event.key === 'Backspace') cursorPosition--
  io.emit('update', contentArea.value)
  oldContent = contentArea.value
  currentRatelimit = process.env.RATELIMIT
  debug('sent content update')
})

setInterval(() => {
  currentRatelimit -= 100
  updateRatelimit()
}, 100)

if (!Cookie.get('primed')) {
  debug('displaying primer')
  const primerArea = document.getElementById('primer')
  const infoArea = document.getElementById('info')
  primerArea.style.display = 'block'
  contentArea.style.display = 'none'
  infoArea.style.display = 'none'
  document.getElementById('primer-ok').addEventListener('click', () => {
    Cookie.set('primed', true)
    primerArea.style.display = 'none'
    contentArea.style.display = 'block'
    infoArea.style.display = 'block'
    debug('hid primer and set cookie')
  })
} else {
  debug('keeping primer hidden')
}