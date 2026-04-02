export function resolveViteBase(command: 'serve' | 'build') {
  return command === 'build' ? './' : '/';
}
