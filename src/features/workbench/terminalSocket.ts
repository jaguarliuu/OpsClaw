import { buildServerWebSocketBaseUrl } from '@/features/workbench/serverBase';

export function buildTerminalWebSocketUrl() {
  return `${buildServerWebSocketBaseUrl()}/ws/terminal`;
}
