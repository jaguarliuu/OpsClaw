export async function pickUploadFiles() {
  if (!window.__OPSCLAW_FILE_DIALOG__) {
    throw new Error('当前运行环境不支持原生文件选择器。');
  }

  return window.__OPSCLAW_FILE_DIALOG__.pickFiles({
    title: '选择要上传的文件',
    properties: ['openFile', 'multiSelections'],
  });
}

export async function pickDownloadTarget(defaultPath?: string) {
  if (!window.__OPSCLAW_FILE_DIALOG__) {
    throw new Error('当前运行环境不支持原生文件选择器。');
  }

  return window.__OPSCLAW_FILE_DIALOG__.pickSavePath({
    title: '选择下载保存位置',
    defaultPath,
  });
}
