const { test } = require('node:test')
const assert = require('node:assert/strict')
const dgram = require('node:dgram')
const net = require('node:net')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const { FIELDS, parseText, parseOSC, compare, variableId } = require('../dist/status.js')
const { StatusReceiver } = require('../dist/status-receiver.js')

function oscString(value) {
  const bytes = Buffer.from(value + '\0')
  return Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4)])
}
function osc(path, type, value) {
  let data = Buffer.alloc(0)
  if (type === 's') data = oscString(value)
  if (type === 'i' || type === 'f') {
    data = Buffer.alloc(4)
    if (type === 'i') data.writeInt32BE(value)
    else data.writeFloatBE(value)
  }
  return Buffer.concat([oscString('/middle8/status/' + path), oscString(',' + type), data])
}

test('JSON, raw and OSC yield matching individual status conditions', () => {
  const json = parseText(JSON.stringify({ sources: { a_receiving: true, b_receiving: false },
    output: { rate_hz: 44 }, preset: { name: 'Show 02', index: null } }))
  const raw = parseText('/middle8/status/sources/a_receiving true\n/middle8/status/sources/b_receiving false\n' +
    '/middle8/status/output/rate_hz 44\n/middle8/status/preset/name Show 02\n/middle8/status/preset/index -')
  const packets = [osc('sources/a_receiving', 'T'), osc('sources/b_receiving', 'F'),
    osc('output/rate_hz', 'i', 44), osc('preset/name', 's', 'Show 02'), osc('preset/index', 's', 'None')]
  const records = new Map(packets.flatMap((packet) => [...parseOSC(packet)]))
  for (const data of [json, raw, records]) {
    assert.equal(compare(data.get('sources/a_receiving'), 'eq', 'true'), true)
    assert.equal(compare(data.get('sources/b_receiving'), 'eq', 'false'), true)
    assert.equal(compare(data.get('output/rate_hz'), 'gte', '40'), true)
    assert.equal(compare(data.get('preset/name'), 'contains', '02'), true)
  }
  assert.equal(compare(json.get('preset/index'), 'eq', '-'), true)
  assert.equal(compare(raw.get('preset/index'), 'eq', '-'), true)
  assert.equal(parseText('/middle8/status/show 001').get('show'), '001')
})

test('OSC bundles, float values and malformed packets', () => {
  const packets = [osc('output/working', 'T'), osc('output/rate_hz', 'f', 30)]
  const bundle = Buffer.concat([oscString('#bundle'), Buffer.alloc(8), ...packets.flatMap((packet) => {
    const size = Buffer.alloc(4); size.writeUInt32BE(packet.length)
    return [size, packet]
  })])
  assert.deepEqual([...parseOSC(bundle)], [['output/working', true], ['output/rate_hz', 30]])
  assert.throws(() => parseOSC(Buffer.from('/middle8/status/no-null')))
  assert.throws(() => parseOSC(bundle.subarray(0, bundle.length - 1)))
  assert.throws(() => parseText('{bad json'))
})

test('comparisons reject missing and nonnumeric data', () => {
  for (const op of ['eq', 'ne', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte']) {
    assert.equal(compare(undefined, op, ''), false)
  }
  assert.equal(compare(false, 'eq', 'false'), true)
  assert.equal(compare('Master', 'ne', 'Backup'), true)
  assert.equal(compare('No signal', 'not_contains', 'RECEIVING'), true)
  assert.equal(compare('', 'gt', '-1'), false)
  assert.equal(compare('-', 'lte', '1'), false)
  assert.equal(compare(0, 'lt', '1'), true)
})

test('raw empty strings and whitespace in names survive parsing', () => {
  assert.equal(parseText('/middle8/status/sources/a_name ').get('sources/a_name'), '')
  assert.equal(parseText('/middle8/status/show  Show Name  \n').get('show'), ' Show Name  ')
  assert.equal(parseText('{}').size, 0)
})

async function receiver(t, transport) {
  let ready
  const listening = new Promise((resolve) => { ready = resolve })
  const errors = []
  const batches = []
  let resolveNext
  const instance = new StatusReceiver({ status_transport: transport, status_port: 0, status_bind: '127.0.0.1' },
    (records) => { batches.push(records); resolveNext?.(records) }, (err) => errors.push(err), ready)
  t.after(() => instance.close())
  await listening
  return { instance, errors, batches, port: instance.socket.address().port,
    next: () => new Promise((resolve) => { resolveNext = resolve }) }
}

for (const transport of ['udp', 'osc']) {
  test(`${transport} receives status on a real UDP socket and survives invalid data`, { timeout: 5000 }, async (t) => {
    const state = await receiver(t, transport)
    const sender = dgram.createSocket('udp4')
    t.after(() => sender.close())
    sender.send(Buffer.from('invalid'), state.port, '127.0.0.1')
    const next = state.next()
    sender.send(transport === 'osc' ? osc('sources/a_receiving', 'F') : Buffer.from('{"sources":{"a_receiving":false}}'),
      state.port, '127.0.0.1')
    assert.equal((await next).get('sources/a_receiving'), false)
    assert.equal(state.errors.length, 1)
  })
}

test('TCP accepts connections, fragmented UTF-8 and multiple JSON/raw records', { timeout: 5000 }, async (t) => {
  const state = await receiver(t, 'tcp')
  const client = net.connect(state.port, '127.0.0.1')
  t.after(() => client.destroy())
  await once(client, 'connect')
  const line = Buffer.from('{"show":"Fúmiga"}\n')
  const split = line.indexOf(Buffer.from('ú')) + 1
  client.write(line.subarray(0, split))
  const first = state.next()
  client.write(line.subarray(split))
  assert.equal((await first).get('show'), 'Fúmiga')
  const next = state.next()
  client.write('/middle8/status/session/role Master\n/middle8/status/universes 8\n')
  await next
  assert.equal(state.batches.at(-1).get('universes'), '8')
  assert.equal(state.errors.length, 0)
  await state.instance.close()
  // Confirm the port is released for config updates.
  const server = net.createServer()
  t.after(() => new Promise((resolve) => server.close(resolve)))
  server.listen(state.port, '127.0.0.1')
  await once(server, 'listening')
})

function instanceUnderTest() {
  let Instance
  class Base {
    saveConfig(values) { this.savedConfig = values }
    setVariableDefinitions(values) { this.variables = values }
    setVariableValues(values) { this.values = { ...this.values, ...values } }
    setFeedbackDefinitions(values) { this.feedbacks = values }
    setActionDefinitions(values) { this.actions = values }
    setPresetDefinitions(values) { this.presets = values }
    checkFeedbacks() { this.checks = (this.checks || 0) + 1 }
    updateStatus(status, message) { this.state = { status, message } }
    log() {}
  }
  const localRequire = createRequire(require.resolve('../dist/index.js'))
  vm.runInNewContext(readFileSync(require.resolve('../dist/index.js'), 'utf8'), {
    exports: {},
    require: (name) => name === '@companion-module/base' ? {
      InstanceBase: Base, InstanceStatus: { Ok: 'ok', Connecting: 'connecting', Disconnected: 'disconnected',
        ConnectionFailure: 'connection_failure', BadConfig: 'bad_config' },
      Regex: {}, runEntrypoint: (cls) => { Instance = cls },
    } : localRequire(name),
    setInterval, clearInterval, Buffer, Date,
  })
  return new Instance()
}

test('Companion registers every field, updates feedbacks, expires individual fields and clears config state', async () => {
  const instance = instanceUnderTest()
  await instance.init({ status_enabled: false, transport: 'tcp', status_timeout: 1 })
  for (const field of FIELDS) assert.ok(instance.feedbacks[variableId(field)], field)
  assert.ok(instance.actions.preset_fire)
  for (const id of ['preset_trigger', 'sessions_onoff', 'panic_onoff', 'input_nic', 'output_nic',
    'source_protocol', 'source_ip', 'source_prio', 'universe_clear_all', 'universe_clear_current',
    'universe_clear_id', 'session_join_named', 'session_leave', 'session_prio', 'session_refresh_nics',
    'session_auto_ip', 'raw_command']) assert.ok(instance.actions[id], id)
  assert.ok(instance.presets.preset_0)
  assert.ok(instance.presets.panic_on)
  instance._receiveStatus(parseText('{"sources":{"a_receiving":true},"output":{"rate_hz":44,"artnet_targets":["10.0.0.2"]}}'))
  assert.equal(instance.feedbacks.status_sources_a_receiving.callback({ options: { operator: 'eq', value: 'true' } }), true)
  assert.equal(instance.values.status_output_artnet_targets_0, '10.0.0.2')
  assert.equal(instance.feedbacks.status_compare.callback({ options: {
    path: '/middle8/status/output/rate_hz', operator: 'gt', value: '40' } }), true)
  instance._statusValues.get('sources/a_receiving').received -= 2000
  instance._expireStatus()
  assert.equal(instance.values.status_sources_a_receiving, undefined)
  assert.equal(instance.feedbacks.status_sources_a_receiving.callback({ options: { operator: 'ne', value: 'false' } }), false)
  assert.equal(instance.values.status_available, true)
  instance._receiveStatus(parseText('{"output":{"artnet_targets":[]}}'))
  assert.equal(instance.values.status_output_artnet_targets_0, undefined)
  instance._lastStatus -= 2000
  instance._expireStatus()
  assert.equal(instance.values.status_available, false)
  assert.equal(instance.state.status, 'disconnected')
  instance._receiveStatus(parseText('/middle8/status/session/panic true'))
  assert.equal(instance.state.status, 'ok')
  await instance.configUpdated({ status_enabled: false, transport: 'tcp' })
  assert.equal(instance.values.status_session_panic, undefined)
  assert.equal(instance.values.status_available, false)
  await instance.destroy()
})

test('change-only mode retains values when expiry is disabled', async () => {
  const instance = instanceUnderTest()
  await instance.init({ transport: 'tcp', status_timeout: 0 })
  instance._receiveStatus(parseText('/middle8/status/sources/b_receiving false'))
  instance._statusValues.get('sources/b_receiving').received = 1
  instance._lastStatus = 1
  instance._expireStatus()
  assert.equal(instance.values.status_available, true)
  assert.equal(instance.values.status_sources_b_receiving, false)
  await instance.destroy()
})

test('value feedbacks and variables expose received names and typed values, then clear stale data', async () => {
  const instance = instanceUnderTest()
  await instance.init({ transport: 'tcp', status_timeout: 1 })
  for (const field of FIELDS) {
    assert.equal(instance.feedbacks[`value_${variableId(field)}`].type, 'value')
  }
  const outputName = instance.feedbacks.value_status_output_interface
  assert.equal(outputName.callback({ options: {} }), null)
  instance._receiveStatus(parseText(JSON.stringify({ output: { interface: 'Ethernet Show Network',
    enabled: false, rate_hz: 44, artnet_targets: ['10.0.0.2'] }, preset: { index: null } })))
  assert.equal(outputName.callback({ options: {} }), 'Ethernet Show Network')
  assert.equal(instance.values.status_output_interface, 'Ethernet Show Network')
  assert.equal(instance.feedbacks.value_status_output_enabled.callback({ options: {} }), false)
  assert.equal(instance.feedbacks.value_status_output_rate_hz.callback({ options: {} }), 44)
  assert.deepEqual(instance.feedbacks.value_status_output_artnet_targets.callback({ options: {} }), ['10.0.0.2'])
  assert.equal(instance.feedbacks.value_status_preset_index.callback({ options: {} }), null)
  assert.equal(instance.feedbacks.status_value.callback({ options: { path: '/middle8/status/output/interface' } }),
    'Ethernet Show Network')
  assert.equal(instance.feedbacks.value_status_output_artnet_targets_0.callback({ options: {} }), '10.0.0.2')
  instance._receiveStatus(parseText('/middle8/status/output/interface Network Card 2'))
  assert.equal(outputName.callback({ options: {} }), 'Network Card 2')
  instance._receiveStatus(parseOSC(osc('output/interface', 's', 'OSC Network Card')))
  assert.equal(outputName.callback({ options: {} }), 'OSC Network Card')
  instance._statusValues.get('output/interface').received -= 2000
  instance._expireStatus()
  assert.equal(outputName.callback({ options: {} }), null)
  assert.equal(instance.values.status_output_interface, undefined)
  await instance.destroy()
})

test('existing UDP commands retain tokens and do not report silent status reception healthy', { timeout: 5000 }, async (t) => {
  const commandReceiver = dgram.createSocket('udp4')
  commandReceiver.bind(0, '127.0.0.1')
  await once(commandReceiver, 'listening')
  t.after(() => commandReceiver.close())
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: '127.0.0.1', transport: 'udp', udpPort: commandReceiver.address().port,
    token: 'show-token', status_enabled: true, status_transport: 'udp', status_port: 0, status_bind: '127.0.0.1' }
  await instance.init(config)
  try { instance._statusReceiver.socket.address() }
  catch (_) { await once(instance._statusReceiver.socket, 'listening') }
  const incoming = once(commandReceiver, 'message')
  await instance.sendTextCommand('sessions on')
  assert.equal((await incoming)[0].toString(), 'show-token sessions on')
  assert.equal(instance.state.status, 'connecting')
  const port = instance._statusReceiver.socket.address().port
  await instance.configUpdated({ ...config, status_port: port })
  assert.equal(instance._statusReceiver.socket.address().port, port)
})

test('feedback ports are independent by protocol and preserve the legacy listen port', () => {
  const { statusPort } = require('../dist/status-receiver.js')
  assert.equal(statusPort({ status_transport: 'udp' }), 9010)
  assert.equal(statusPort({ status_transport: 'tcp' }), 9011)
  assert.equal(statusPort({ status_transport: 'osc' }), 9012)
  const config = { status_port: 9020, status_udp_port: 9021, status_tcp_port: 9022, status_osc_port: 9023 }
  for (const [protocol, expected] of [['udp', 9021], ['tcp', 9022], ['osc', 9023]]) {
    assert.equal(statusPort({ ...config, status_transport: protocol }), expected)
    assert.equal(statusPort({ status_port: 9020, status_transport: protocol }), 9020)
  }
})

test('saving settings recovers from an occupied UDP feedback port and changes protocol', { timeout: 8000 }, async (t) => {
  const occupied = dgram.createSocket('udp4')
  occupied.bind(0, '127.0.0.1')
  await once(occupied, 'listening')
  t.after(() => occupied.close())
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: '127.0.0.1', status_enabled: true, status_bind: '127.0.0.1',
    status_transport: 'udp', status_udp_port: occupied.address().port }
  await instance.init(config)
  assert.equal(instance.state.status, 'connection_failure')
  const failedReceiver = instance._statusReceiver
  await instance.configUpdated({ ...config, status_udp_port: 0 })
  assert.notEqual(instance._statusReceiver, failedReceiver)
  assert.equal(await instance._statusReceiver.ready, true)
  const udpPort = instance._statusReceiver.socket.address().port
  // Switch the very same port to OSC, proving the old UDP socket is released.
  await instance.configUpdated({ ...config, host: 'localhost', status_transport: 'osc', status_osc_port: udpPort })
  assert.equal(instance._statusReceiver.socket.address().port, udpPort)
  assert.equal(instance.config.host, 'localhost')
  const sender = dgram.createSocket('udp4')
  t.after(() => sender.close())
  const message = once(instance._statusReceiver.socket, 'message')
  sender.send(osc('output/interface', 's', 'New output NIC'), udpPort, '127.0.0.1')
  await message
  assert.equal(instance.values.status_output_interface, 'New output NIC')
  await instance.configUpdated({ ...config, status_transport: 'tcp', status_tcp_port: 0 })
  assert.equal(instance._statusReceiver.socket instanceof net.Server, true)
  assert.equal(await instance._statusReceiver.ready, true)
})

test('closing a UDP listener before bind completes leaves no stale bound socket', { timeout: 5000 }, async () => {
  let notified = false
  const receiver = new StatusReceiver({ status_bind: 'localhost', status_udp_port: 0 },
    () => assert.fail('closed listener delivered status'), () => undefined, () => { notified = true })
  await receiver.close()
  assert.equal(notified, false)
  assert.throws(() => receiver.socket.address())
  await receiver.close()
})

test('rapid saves and disable use the latest configuration and clear old listeners', { timeout: 8000 }, async (t) => {
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: 'localhost', status_enabled: true, status_bind: '127.0.0.1',
    status_udp_port: 0, status_osc_port: 0, status_tcp_port: 0 }
  await instance.init({ ...config, status_transport: 'udp' })
  const first = instance._statusReceiver
  await Promise.all(['tcp', 'udp', 'osc', 'udp', 'tcp'].map((protocol) =>
    instance.configUpdated({ ...config, status_transport: protocol })))
  assert.equal(instance.config.status_transport, 'tcp')
  assert.equal(instance._statusReceiver.socket instanceof net.Server, true)
  assert.equal(await instance._statusReceiver.ready, true)
  assert.throws(() => first.socket.address())
  await Promise.all([
    instance.configUpdated({ ...config, status_transport: 'osc' }),
    instance.configUpdated({ ...config, status_enabled: false }),
  ])
  assert.equal(instance._statusReceiver, null)
  assert.equal(instance._statusTimer, null)
  assert.equal(instance.values.status_available, false)
})

test('multiple module connections keep feedback ports and values independent', { timeout: 8000 }, async (t) => {
  const first = instanceUnderTest(), second = instanceUnderTest()
  t.after(() => first.destroy())
  t.after(() => second.destroy())
  await Promise.all([
    first.init({ host: '127.0.0.1', status_enabled: true, status_udp_port: 0, status_bind: '127.0.0.1' }),
    second.init({ host: 'localhost', status_enabled: true, status_udp_port: 0, status_bind: '127.0.0.1' }),
  ])
  const ports = [first, second].map((instance) => instance._statusReceiver.socket.address().port)
  assert.notEqual(ports[0], ports[1])
  const sender = dgram.createSocket('udp4')
  t.after(() => sender.close())
  await Promise.all([first, second].map(async (instance, i) => {
    const message = once(instance._statusReceiver.socket, 'message')
    sender.send(Buffer.from(JSON.stringify({ output: { interface: `Card ${i}` } })), ports[i], '127.0.0.1')
    await message
  }))
  assert.equal(first.values.status_output_interface, 'Card 0')
  assert.equal(second.values.status_output_interface, 'Card 1')
  await first.configUpdated({ ...first.config, status_udp_port: 0 })
  assert.equal(first.values.status_output_interface, undefined)
  assert.equal(second.values.status_output_interface, 'Card 1')
  assert.equal(second._statusReceiver.socket.address().port, ports[1])
})

test('feedback is limited to the saved Middle8 host and can override its source interface', { timeout: 8000 }, async (t) => {
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: '192.0.2.10', status_enabled: true, status_udp_port: 0, status_bind: '127.0.0.1' }
  await instance.init(config)
  const sender = dgram.createSocket('udp4')
  t.after(() => sender.close())
  const packet = Buffer.from('{"show":"Correct sender"}')
  let message = once(instance._statusReceiver.socket, 'message')
  sender.send(packet, instance._statusReceiver.socket.address().port, '127.0.0.1')
  await message
  assert.equal(instance.values.status_show, undefined)
  await instance.configUpdated({ ...config, status_source_host: ' 127.0.0.1 ' })
  message = once(instance._statusReceiver.socket, 'message')
  sender.send(packet, instance._statusReceiver.socket.address().port, '127.0.0.1')
  await message
  assert.equal(instance.values.status_show, 'Correct sender')
})

test('TCP feedback sender filtering changes when a new Middle8 host is saved', { timeout: 8000 }, async (t) => {
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: '192.0.2.10', status_enabled: true, status_transport: 'tcp',
    status_tcp_port: 0, status_bind: '127.0.0.1' }
  await instance.init(config)
  const rejected = net.connect(instance._statusReceiver.socket.address().port, '127.0.0.1')
  rejected.on('error', () => undefined)
  await once(rejected, 'close')
  assert.equal(instance.values.status_show, undefined)
  await instance.configUpdated({ ...config, host: ' localhost ' })
  const received = new Promise((resolve) => {
    const original = instance._receiveStatus.bind(instance)
    instance._receiveStatus = (records) => { original(records); resolve() }
  })
  const accepted = net.connect(instance._statusReceiver.socket.address().port, '127.0.0.1')
  t.after(() => accepted.destroy())
  accepted.end('{"show":"Updated host"}\n')
  await received
  assert.equal(instance.values.status_show, 'Updated host')
})

test('existing single feedback-port settings remain visible when upgrading', async () => {
  const instance = instanceUnderTest()
  await instance.init({ status_enabled: false, status_transport: 'osc', status_port: 9212 })
  const fields = instance.getConfigFields()
  assert.equal(fields.find((field) => field.id === 'status_osc_port').default, 9212)
  assert.equal(fields.find((field) => field.id === 'status_udp_port').default, 9010)
  assert.equal(fields.find((field) => field.id === 'status_tcp_port').default, 9011)
  await instance.destroy()
})

test('existing command actions use newly saved UDP/TCP/OSC destinations', { timeout: 8000 }, async (t) => {
  const udp = dgram.createSocket('udp4'), oscServer = dgram.createSocket('udp4')
  const tcp = net.createServer()
  udp.bind(0, '127.0.0.1'); oscServer.bind(0, '127.0.0.1'); tcp.listen(0, '127.0.0.1')
  await Promise.all([once(udp, 'listening'), once(oscServer, 'listening'), once(tcp, 'listening')])
  t.after(() => udp.close()); t.after(() => oscServer.close()); t.after(() => tcp.close())
  const instance = instanceUnderTest()
  t.after(() => instance.destroy())
  const config = { host: '127.0.0.1', transport: 'udp', udpPort: udp.address().port,
    tcpPort: tcp.address().port, oscPort: oscServer.address().port, status_enabled: false }
  await instance.init(config)
  const action = instance.actions.raw_command
  let incoming = once(udp, 'message')
  await action.callback({ options: { cmd: 'sessions on' } })
  assert.equal((await incoming)[0].toString(), 'sessions on')
  await instance.configUpdated({ ...config, host: ' localhost ', transport: 'tcp' })
  const tcpIncoming = new Promise((resolve) => tcp.once('connection', (client) => client.once('data', (data) => {
    resolve(data.toString()); client.destroy()
  })))
  await action.callback({ options: { cmd: 'panic off' } })
  assert.equal(await tcpIncoming, 'panic off')
  await instance.configUpdated({ ...config, transport: 'osc' })
  incoming = once(oscServer, 'message')
  await action.callback({ options: { cmd: 'sessions off' } })
  const received = require('osc').readPacket((await incoming)[0], { metadata: false })
  assert.equal(received.address, '/cmd')
  assert.deepEqual(received.args, ['sessions off'])
})

test('parallel OSC commands avoid the fixed 57121 bind and deliver all command variants', { timeout: 8000 }, async (t) => {
  const receiver = dgram.createSocket('udp4'), occupied = dgram.createSocket('udp4')
  receiver.bind(0, '127.0.0.1')
  await once(receiver, 'listening')
  t.after(() => receiver.close())
  // Keep the library's old default port occupied to reproduce the bind conflict.
  occupied.bind(57121, '127.0.0.1')
  try { await once(occupied, 'listening') } catch (error) { if (error.code !== 'EADDRINUSE') throw error }
  t.after(() => { try { occupied.close() } catch (_) {} })
  const { sendOscCmd, sendOscPresetFire, sendOscPresetTrigger } = require('../dist/network.js')
  const options = { host: '127.0.0.1', port: receiver.address().port }
  const packets = []
  let complete
  const delivered = new Promise((resolve) => { complete = resolve })
  receiver.on('message', (data) => {
    packets.push(require('osc').readPacket(data, { metadata: false }))
    if (packets.length === 12) complete()
  })
  await Promise.all(Array.from({ length: 4 }, (_, i) => Promise.all([
    sendOscCmd(options, `preset fire ${i}`, 'token'), sendOscPresetFire(options, i),
    sendOscPresetTrigger(options, i + 1, 'token'),
  ])))
  await delivered
  assert.equal(packets.filter((packet) => packet.address === '/cmd').length, 4)
  assert.equal(packets.filter((packet) => packet.address === '/preset/fire').length, 4)
  assert.equal(packets.filter((packet) => packet.address === '/preset/trigger').length, 4)
})
