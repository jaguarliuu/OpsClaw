function stripUtf8Bom(text: string) {
  return text.replace(/^\uFEFF/, '');
}

function decodeWithEncoding(bytes: Uint8Array, encoding: string, fatal: boolean) {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

export function decodeCsvImportBytes(bytes: Uint8Array) {
  try {
    return stripUtf8Bom(decodeWithEncoding(bytes, 'utf-8', true));
  } catch {
    try {
      return stripUtf8Bom(decodeWithEncoding(bytes, 'gb18030', false));
    } catch {
      return stripUtf8Bom(decodeWithEncoding(bytes, 'utf-8', false));
    }
  }
}

export async function readCsvImportFile(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return decodeCsvImportBytes(bytes);
}
