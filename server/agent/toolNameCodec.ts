const MODEL_SAFE_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function encodeToolNameForModel(name: string) {
  if (MODEL_SAFE_TOOL_NAME_PATTERN.test(name)) {
    return `opsclaw__${name}`;
  }

  const escaped = Array.from(name)
    .map((char) => {
      if (/[a-zA-Z0-9-]/.test(char)) {
        return char;
      }

      return `_x${char.codePointAt(0)?.toString(16).toUpperCase() ?? '00'}_`;
    })
    .join('');

  return `opsclaw__${escaped}`;
}

export function isModelSafeToolName(name: string) {
  return MODEL_SAFE_TOOL_NAME_PATTERN.test(name);
}
