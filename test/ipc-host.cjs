const dgram = require('node:dgram')
const { fork } = require('node:child_process')
const { EventEmitter, once } = require('node:events')
const path = require('node:path')
const { IpcWrapper } = require(path.join(path.dirname(require.resolve('@companion-module/base')), 'host-api/ipc-wrapper.js'))

// Exercise the real module/base IPC protocol and its SharedUdpSocketImpl, with a
// small host-side UDP broker implementing Companion's join/leave/fanout contract.
class UdpBroker {
  entries = new Map()
  handles = new Map()
  nextHandle = 1
  joins = []

  async join(host, { family, portNumber }) {
    this.joins.push({ id: host.id, port: portNumber })
    let entry = this.entries.get(portNumber)
    if (!entry) {
      const socket = dgram.createSocket(family)
      entry = { socket, subscribers: new Map() }
      this.entries.set(portNumber, entry)
      entry.ready = new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(portNumber, '0.0.0.0', resolve)
      })
      socket.on('message', (packet, peer) => this.deliver(portNumber, packet, peer))
    }
    await entry.ready
    const handleId = `shared-${this.nextHandle++}`
    entry.subscribers.set(handleId, host)
    this.handles.set(handleId, portNumber)
    return handleId
  }

  deliver(port, message, source) {
    const entry = this.entries.get(port)
    if (!entry) return
    for (const [handleId, host] of entry.subscribers) {
      host.ipc.sendWithNoCb('sharedUdpSocketMessage', { handleId, portNumber: port, message, source })
    }
  }

  async leave({ handleId }) {
    const port = this.handles.get(handleId)
    const entry = this.entries.get(port)
    this.handles.delete(handleId)
    if (!entry) return
    entry.subscribers.delete(handleId)
    if (!entry.subscribers.size) {
      this.entries.delete(port)
      await new Promise((resolve) => entry.socket.close(resolve))
    }
  }

  async close() {
    await Promise.all([...this.entries.values()].map(async (entry) => {
      await entry.ready.catch(() => undefined)
      await new Promise((resolve) => { try { entry.socket.close(resolve) } catch (_) { resolve() } })
    }))
    this.entries.clear()
    this.handles.clear()
  }
}

function startModule(id, broker) {
  const entrypoint = process.env.MIDDLE8_TEST_ENTRYPOINT || path.resolve('dist/index.js')
  const manifest = process.env.MIDDLE8_TEST_ENTRYPOINT ? path.join(path.dirname(entrypoint), 'companion/manifest.json') : path.resolve('companion/manifest.json')
  const child = fork(entrypoint, [], {
    env: { ...process.env, MODULE_MANIFEST: manifest, CONNECTION_ID: id, VERIFICATION_TOKEN: 'integration-test' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const host = { id, child, events: new EventEmitter(), variables: {}, logs: [], statuses: [] }
  child.stdout.on('data', (data) => host.logs.push(data.toString()))
  child.stderr.on('data', (data) => host.logs.push(data.toString()))
  let registerId
  let registered
  host.registered = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Registration timed out: ${host.logs.join('\n')}`)), 10000)
    registered = () => { clearTimeout(timeout); resolve() }
    child.once('error', (error) => { clearTimeout(timeout); reject(error) })
  })
  const updateVariables = ({ newValues = [] }) => {
    for (const value of newValues) host.variables[value.id] = value.value
    host.events.emit('variables')
  }
  const ignore = async () => undefined
  host.ipc = new IpcWrapper({
    register: ignore,
    'log-message': async ({ level, message }) => host.logs.push(`${level}: ${message}`),
    'set-status': async (state) => host.statuses.push(state),
    setActionDefinitions: ignore,
    setPresetDefinitions: ignore,
    setFeedbackDefinitions: ignore,
    updateFeedbackValues: ignore,
    setVariableDefinitions: async (message) => updateVariables(message),
    setVariableValues: async (message) => updateVariables(message),
    saveConfig: async (message) => { host.savedConfig = message.config },
    sharedUdpSocketJoin: async (message) => broker.join(host, message),
    sharedUdpSocketLeave: async (message) => broker.leave(message),
  }, (message) => {
    if (child.connected) child.send(message)
    // Queue registration's response before the first host->module call.
    if (message.direction === 'response' && message.callbackId === registerId) registered()
  }, 10000)
  child.on('message', (message) => {
    if (message.name === 'register') registerId = message.callbackId
    host.ipc.receivedMessage(message)
  })
  host.call = (name, message) => host.ipc.sendWithCb(name, message)
  host.init = async (config) => {
    await host.registered
    return host.call('init', { label: id, config, secrets: {}, isFirstInit: false,
      lastUpgradeIndex: -1, actions: {}, feedbacks: {} })
  }
  host.save = (config) => host.call('updateConfigAndLabel', { label: id, config, secrets: {} })
  host.waitForValue = (key, expected) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      host.events.removeListener('variables', check)
      reject(new Error(`${id}: no ${key}=${expected}; logs: ${host.logs.join('\n')}`))
    }, 5000)
    const check = () => {
      if (host.variables[key] === expected) {
        clearTimeout(timeout)
        host.events.removeListener('variables', check)
        resolve()
      }
    }
    host.events.on('variables', check)
    check()
  })
  host.close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    try { await host.call('destroy', {}) } catch (_) {}
    const exited = once(child, 'exit')
    child.kill()
    await exited
  }
  return host
}

async function unusedUdpPort() {
  const socket = dgram.createSocket('udp4')
  socket.bind(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  return port
}

module.exports = { UdpBroker, startModule, unusedUdpPort }
