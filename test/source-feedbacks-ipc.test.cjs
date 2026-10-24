const { test } = require('node:test')
const assert = require('node:assert/strict')
const dgram = require('node:dgram')
const { SOURCE_FIELDS } = require('../dist/status.js')
const { UdpBroker, startModule, unusedUdpPort } = require('./ipc-host.cjs')

test('Companion receives matching A/B comparison definitions and evaluates Source B independently', { timeout: 20000 }, async (t) => {
  const broker = new UdpBroker()
  const module = startModule('source-feedback-parity', broker)
  const sender = dgram.createSocket('udp4')
  t.after(async () => {
    await module.close(); await broker.close()
    try { sender.close() } catch (_) {}
  })
  const port = await unusedUdpPort()
  await module.init({ host: '127.0.0.1', status_enabled: true, status_udp_port: port })
  const definitions = new Map(module.feedbackDefinitions.map((definition) => [definition.id, definition]))
  const samples = { receiving: true, protocol: 'sACN', name: 'Desk', selection: 'Priority 100',
    sender_ip: '192.0.2.10', artnet_any: false, sacn_priority: 100 }
  const feedbacks = {}
  for (const { id } of SOURCE_FIELDS) {
    const a = definitions.get(`status_sources_a_${id}`)
    const b = definitions.get(`status_sources_b_${id}`)
    assert.equal(a.type, 'boolean', id)
    assert.equal(b.type, 'boolean', id)
    assert.deepEqual(a.options, b.options, id)
    assert.equal(a.showInvert, b.showInvert, id)
    assert.equal(b.options[0].choices.length, 8, id)
    for (const source of ['a', 'b']) {
      const key = `check-${source}-${id}`
      feedbacks[key] = { id: key, feedbackId: `status_sources_${source}_${id}`, controlId: 'test-button',
        disabled: false, isInverted: false, upgradeIndex: null,
        options: { operator: 'eq', value: String(samples[id]) } }
    }
  }
  feedbacks['raw-b'] = { id: 'raw-b', feedbackId: 'value_status_sources_b_receiving', controlId: 'test-button',
    disabled: false, isInverted: false, upgradeIndex: null, options: {} }
  feedbacks['select-b'] = { id: 'select-b', feedbackId: 'source_status_compare', controlId: 'test-button',
    disabled: false, isInverted: false, upgradeIndex: null,
    options: { source: 'b', field: 'receiving', operator: 'eq', value: 'true' } }
  module.events.setMaxListeners(Object.keys(feedbacks).length + 4)
  await module.call('updateFeedbacks', { feedbacks })
  const sources = Object.fromEntries(['a', 'b'].flatMap((source) =>
    Object.entries(samples).map(([key, value]) => [`${source}_${key}`, value])))
  sender.send(Buffer.from(JSON.stringify({ sources })), port, '127.0.0.1')
  await Promise.all(Object.keys(feedbacks).map((key) => module.waitForFeedback(key, true)))
  sender.send(Buffer.from('{"sources":{"b_receiving":false}}'), port, '127.0.0.1')
  await Promise.all(['check-b-receiving', 'raw-b', 'select-b'].map((key) => module.waitForFeedback(key, false)))
  assert.equal(module.feedbackValues['check-a-receiving'], true)
  assert.ok(module.logs.every((line) => !line.includes('Feedback error')), module.logs.join('\n'))
})
