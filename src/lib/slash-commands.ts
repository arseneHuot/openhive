export interface BuiltinCommand {
  command: string
  description: string
  usage?: string
  handler: (args: string) => { text: string; type: 'replace' | 'action' }
}

export const BUILTIN_COMMANDS: BuiltinCommand[] = [
  {
    command: '/shrug',
    description: 'Append a shrug \u00af\\_(\u30c4)_/\u00af',
    handler: (args) => ({ text: `${args} \u00af\\_(\u30c4)_/\u00af`.trim(), type: 'replace' }),
  },
  {
    command: '/tableflip',
    description: 'Append a table flip (\u256f\u00b0\u25a1\u00b0)\u256f\ufe35 \u253b\u2501\u253b',
    handler: (args) => ({ text: `${args} (\u256f\u00b0\u25a1\u00b0)\u256f\ufe35 \u253b\u2501\u253b`.trim(), type: 'replace' }),
  },
  {
    command: '/unflip',
    description: 'Put the table back \u252c\u2500\u252c\u30ce( \u00ba _ \u00ba\u30ce)',
    handler: (args) => ({ text: `${args} \u252c\u2500\u252c\u30ce( \u00ba _ \u00ba\u30ce)`.trim(), type: 'replace' }),
  },
  {
    command: '/me',
    description: 'Display action text',
    usage: '/me [action]',
    handler: (args) => ({ text: `_${args}_`, type: 'replace' }),
  },
  {
    command: '/lenny',
    description: 'Append Lenny face ( \u0361\u00b0 \u035c\u0296 \u0361\u00b0)',
    handler: (args) => ({ text: `${args} ( \u0361\u00b0 \u035c\u0296 \u0361\u00b0)`.trim(), type: 'replace' }),
  },
]

export function findMatchingCommands(query: string): BuiltinCommand[] {
  const lower = query.toLowerCase()
  return BUILTIN_COMMANDS.filter(cmd =>
    cmd.command.toLowerCase().startsWith(lower)
  )
}
