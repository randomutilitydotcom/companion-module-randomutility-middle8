const { test } = require('node:test')
const assert = require('node:assert/strict')
const dgram = require('node:dgram')
const osc = require('osc')
const { UdpBroker, startModule, unusedUdpPort } = require('./ipc-host.cjs')

test('separate real module processes share UDP feedback and apply saved ports through Companion IPC', { timeout: 30000 }, async (t) => {
  const broker = new UdpBroker()
  const modules = []
  const sender = dgram.createSocket('udp4')
  t.after(async () => {
    await Promise.all(modules.map((host) => host.close()))
    await broker.close()
    try { sender.close() } catch (_) {}
  })
  const sharedPort = await unusedUdpPort()
  const first = startModule('middle8-a', broker), second = startModule('middle8-b', broker)
  modules.push(first, second)
  const config = { host: '127.0.0.1', transport: 'udp', udpPort: 9000, tcpPort: 9001, oscPort: 9002,
    status_enabled: true, status_transport: 'udp', status_udp_port: sharedPort, status_bind: '0.0.0.0' }
  const secondConfig = { ...config, host: '192.0.2.10' }
  const initialized = await Promise.all([first.init(config), second.init(secondConfig)])
  assert.equal(initialized[0].updatedConfig.status_udp_port, sharedPort)
  assert.equal(broker.entries.size, 1)
  assert.equal(broker.entries.get(sharedPort).subscribers.size, 2)

  // One actual UDP datagram is fanned out to both module processes by the host.
  sender.send(Buffer.from('{"output":{"interface":"Card A"}}'), sharedPort, '127.0.0.1')
  await first.waitForValue('status_output_interface', 'Card A')
  await second.call('getConfigFields', {})
  assert.notEqual(second.variables.status_output_interface, 'Card A')

  // Exercise the host's peer metadata for a second remote LAN host without
  // requiring the test computer to own that IP address.
  broker.deliver(sharedPort, Buffer.from('{"output":{"interface":"Card B"}}'),
    { address: '192.0.2.10', family: 'IPv4', port: 50000, size: 33 })
  await second.waitForValue('status_output_interface', 'Card B')
  await first.call('getConfigFields', {})
  assert.equal(first.variables.status_output_interface, 'Card A')

  const movedUdpPort = await unusedUdpPort()
  await first.save({ ...config, host: 'localhost', status_udp_port: movedUdpPort })
  assert.equal(broker.joins.at(-1).port, movedUdpPort)
  const fields = await first.call('getConfigFields', {})
  assert.equal(fields.fields.find((field) => field.id === 'status_udp_port').default, movedUdpPort)
  sender.send(Buffer.from('{"output":{"interface":"Moved UDP Card"}}'), movedUdpPort, '127.0.0.1')
  await first.waitForValue('status_output_interface', 'Moved UDP Card')
  assert.equal(second.variables.status_output_interface, 'Card B')

  const newPort = await unusedUdpPort()
  const saved = { ...config, host: 'localhost', transport: 'osc', oscPort: 10002,
    status_udp_port: movedUdpPort, status_transport: 'osc', status_osc_port: newPort }
  await first.save(saved)
  assert.equal(broker.entries.size, 2)
  assert.equal(broker.entries.get(sharedPort).subscribers.size, 1)
  assert.equal(broker.joins.at(-1).port, newPort)
  assert.ok(first.logs.some((line) => line.includes('Applying saved config: commands osc localhost')))
  sender.send(Buffer.from(osc.writePacket({ address: '/middle8/status/output/interface', args: ['New OSC Card'] })), newPort, '127.0.0.1')
  await first.waitForValue('status_output_interface', 'New OSC Card')
  assert.equal(second.variables.status_output_interface, 'Card B')

  // Disabling one subscriber must not close another connection's shared port.
  await second.save({ ...secondConfig, status_enabled: false })
  assert.equal(broker.entries.has(sharedPort), false)
  assert.equal(broker.entries.has(newPort), true)
  assert.ok(first.statuses.length > 0)
  assert.ok(second.statuses.length > 0)
  assert.ok(first.statuses.every((state) => state.status !== 'connection_failure'), first.logs.join('\n'))
  assert.ok(second.statuses.every((state) => state.status !== 'connection_failure'), second.logs.join('\n'))

  // Restart from the saved configuration, just as Companion does after an update.
  await first.close()
  const restarted = startModule('middle8-a-restarted', broker)
  modules.push(restarted)
  await restarted.init(saved)
  assert.equal(broker.joins.at(-1).port, newPort)
  sender.send(Buffer.from(osc.writePacket({ address: '/middle8/status/output/interface', args: ['After restart'] })), newPort, '127.0.0.1')
  await restarted.waitForValue('status_output_interface', 'After restart')
})
