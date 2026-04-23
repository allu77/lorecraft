import { describe, it, expect } from 'vitest';
import { parseGenerateCommand } from './index.js';

describe('parseGenerateCommand', () => {
  it('simple type with no inputs', () => {
    expect(parseGenerateCommand('npc')).toEqual({ type: 'npc', inputs: {} });
  });

  it('type with simple unquoted inputs', () => {
    expect(parseGenerateCommand('npc name:Mira role:Spy')).toEqual({
      type: 'npc',
      inputs: { name: 'Mira', role: 'Spy' },
    });
  });

  it('quoted values preserve spaces', () => {
    expect(
      parseGenerateCommand(
        'npc name:"Mira Shadowcloak" faction:"Thieves Guild"',
      ),
    ).toEqual({
      type: 'npc',
      inputs: { name: 'Mira Shadowcloak', faction: 'Thieves Guild' },
    });
  });

  it('mixed quoted and unquoted values', () => {
    expect(
      parseGenerateCommand('npc name:"Mira Shadowcloak" role:Spy'),
    ).toEqual({
      type: 'npc',
      inputs: { name: 'Mira Shadowcloak', role: 'Spy' },
    });
  });

  it('extra leading/trailing whitespace is handled gracefully', () => {
    expect(parseGenerateCommand('  npc  name:Mira  ')).toEqual({
      type: 'npc',
      inputs: { name: 'Mira' },
    });
  });
});
