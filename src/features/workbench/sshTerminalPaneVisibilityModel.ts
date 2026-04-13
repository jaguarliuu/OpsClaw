type ShouldRestoreSshTerminalViewportInput = {
  active: boolean;
  visible: boolean;
  wasVisible: boolean;
};

export function shouldRestoreSshTerminalViewport({
  active,
  visible,
  wasVisible,
}: ShouldRestoreSshTerminalViewportInput) {
  return active && visible && !wasVisible;
}
