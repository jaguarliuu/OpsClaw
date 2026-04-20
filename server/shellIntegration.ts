export const SHELL_INTEGRATION_SCRIPT = [
  '__oc_precmd() { printf "\\033]133;D;${__oc_ec:-0}\\007"; printf "\\033]133;A\\007"; }',
  '__oc_preexec() { printf "\\033]133;C\\007"; }',
  '[ -n "$BASH_VERSION" ] && {',
  '  PROMPT_COMMAND="__oc_ec=\\$?; __oc_precmd${PROMPT_COMMAND:+; $PROMPT_COMMAND}"',
  '  trap \'__oc_preexec\' DEBUG',
  '}',
  '[ -n "$ZSH_VERSION" ] && {',
  '  precmd_functions+=(__oc_precmd)',
  '  preexec_functions+=(__oc_preexec)',
  '}',
].join('\n');

export const OSC133_A = '\x1b]133;A\x07';
export const OSC133_C = '\x1b]133;C\x07';
export const OSC133_D_PREFIX = '\x1b]133;D;';
export const OSC133_BEL = '\x07';
