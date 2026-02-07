import type { CompanionPresetDefinitions } from '@companion-module/base'
import type { Middle8Instance } from './index.js'

export function getPresets(self: Middle8Instance): CompanionPresetDefinitions {
  const presets: CompanionPresetDefinitions = {}

  for (let i = 0; i < 10; i++) {
    presets[`preset_${i}`] = {
      type: 'button',
      category: 'Presets',
      name: `Fire Preset ${i}`,
      style: {
        text: `Preset\n${i}`,
        size: '18',
        color: 16777215,
        bgcolor: 0,
      },
      steps: [
        {
          down: [{ actionId: 'preset_fire', options: { index: i } }],
          up: [],
        },
      ],
      feedbacks: [],
    }
  }

  presets['sessions_on'] = {
    type: 'button',
    category: 'System',
    name: 'Sessions On',
    style: {
      text: 'Sessions\nON',
      size: '18',
      color: 16777215,
      bgcolor: 0,
    },
    steps: [{ down: [{ actionId: 'sessions_onoff', options: { state: 'on' } }], up: [] }],
    feedbacks: [],
  }

  presets['sessions_off'] = {
    type: 'button',
    category: 'System',
    name: 'Sessions Off',
    style: {
      text: 'Sessions\nOFF',
      size: '18',
      color: 16777215,
      bgcolor: 0,
    },
    steps: [{ down: [{ actionId: 'sessions_onoff', options: { state: 'off' } }], up: [] }],
    feedbacks: [],
  }

  presets['panic_on'] = {
    type: 'button',
    category: 'System',
    name: 'Panic On',
    style: {
      text: 'PANIC\nON',
      size: '18',
      color: 16777215,
      bgcolor: 0,
    },
    steps: [{ down: [{ actionId: 'panic_onoff', options: { state: 'on' } }], up: [] }],
    feedbacks: [],
  }

  presets['panic_off'] = {
    type: 'button',
    category: 'System',
    name: 'Panic Off',
    style: {
      text: 'PANIC\nOFF',
      size: '18',
      color: 16777215,
      bgcolor: 0,
    },
    steps: [{ down: [{ actionId: 'panic_onoff', options: { state: 'off' } }], up: [] }],
    feedbacks: [],
  }

  return presets
}
