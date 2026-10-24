const { test } = require('node:test')
const assert = require('node:assert/strict')
const { UdpBroker, startModule } = require('./ipc-host.cjs')
const { normalizeConfig } = require('../dist/config.js')

function invalidFormFields(fields, config) {
  // Companion 5.1.1 validates saved config values, not field-definition defaults.
  return fields.filter((field) => {
    const value = config[field.id]
    if (field.type === 'number') {
      return value === undefined || value === null || value === '' ||
        !Number.isFinite(Number(value)) || Number(value) < field.min || Number(value) > field.max
    }
    if (field.type === 'dropdown') return !field.choices.some((choice) => choice.id === value)
    return false
  }).map((field) => field.id)
}

test('an upgraded connection has valid persisted form values before the user clicks Save', { timeout: 20000 }, async (t) => {
  const broker = new UdpBroker()
  const module = startModule('existing-connection-upgrade', broker)
  t.after(async () => { await module.close(); await broker.close() })
  // Existing 1.2.0 config has only a single status port. A field's default does
  // not put new protocol-specific ports into this already-saved config.
  const legacy = { host: '192.0.2.10', transport: 'udp', udpPort: 9100, tcpPort: 9101, oscPort: 9102,
    token: 'existing-token', includeTokenInOsc: true, oscPresetUsesShortcut: false,
    status_enabled: false, status_transport: 'udp', status_port: 9210,
    status_bind: '0.0.0.0', status_timeout: 0 }
  const initialized = await module.init(legacy)
  const { fields } = await module.call('getConfigFields', {})
  assert.deepEqual(invalidFormFields(fields, initialized.updatedConfig), [])
  assert.equal(initialized.updatedConfig.status_udp_port, 9210)
  assert.equal(initialized.updatedConfig.status_tcp_port, 9011)
  assert.equal(initialized.updatedConfig.status_osc_port, 9012)
  assert.equal(initialized.updatedConfig.status_source_host, '')
  assert.equal(module.savedConfig.status_udp_port, 9210)
  for (const [key, value] of Object.entries(legacy)) assert.equal(initialized.updatedConfig[key], value, key)
  const edited = { ...initialized.updatedConfig, host: '192.0.2.11', status_tcp_port: 9311 }
  await module.save(edited)
  assert.deepEqual(invalidFormFields(fields, edited), [])
})

test('configuration migration preserves custom ports, zero timeout, booleans and unknown settings', () => {
  for (const protocol of ['udp', 'tcp', 'osc']) {
    const original = { host: '192.0.2.42', status_transport: protocol, status_port: 9510,
      status_timeout: 0, status_enabled: false, includeTokenInOsc: false, token: '', futureSetting: 'preserved' }
    const migrated = normalizeConfig(original)
    assert.equal(migrated[`status_${protocol}_port`], 9510)
    assert.equal(migrated.status_timeout, 0)
    assert.equal(migrated.status_enabled, false)
    assert.equal(migrated.includeTokenInOsc, false)
    assert.equal(migrated.futureSetting, 'preserved')
    assert.deepEqual(normalizeConfig(migrated), migrated)
    assert.equal(normalizeConfig({ ...original, [`status_${protocol}_port`]: 9610 })[`status_${protocol}_port`], 9610)
  }
})

test('already complete connections are not repeatedly rewritten during initialization or save', { timeout: 20000 }, async (t) => {
  const broker = new UdpBroker()
  const module = startModule('complete-connection', broker)
  t.after(async () => { await module.close(); await broker.close() })
  const complete = normalizeConfig({ host: '192.0.2.10', status_enabled: false })
  await module.init(complete)
  assert.equal(module.savedConfig, undefined)
  await module.save({ ...complete, host: '192.0.2.11' })
  assert.equal(module.savedConfig, undefined)
})
