function openBrowserFilePicker() {
  return new Promise<{ canceled: boolean; paths: string[]; files?: File[] }>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const cleanup = () => {
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel);
      input.remove();
    };

    const finalize = (payload: { canceled: boolean; paths: string[]; files?: File[] }) => {
      cleanup();
      resolve(payload);
    };

    const handleChange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        finalize({ canceled: true, paths: [] });
        return;
      }

      finalize({
        canceled: false,
        paths: files.map((file) => file.name),
        files,
      });
    };

    const handleCancel = () => {
      finalize({ canceled: true, paths: [] });
    };

    input.addEventListener('change', handleChange, { once: true });
    input.addEventListener('cancel', handleCancel, { once: true });
    input.click();
  });
}

export async function pickUploadFiles() {
  if (window.__OPSCLAW_FILE_DIALOG__) {
    return window.__OPSCLAW_FILE_DIALOG__.pickFiles({
      title: '选择要上传的文件',
      properties: ['openFile', 'multiSelections'],
    });
  }

  return openBrowserFilePicker();
}

export async function pickDownloadTarget(defaultPath?: string) {
  if (window.__OPSCLAW_FILE_DIALOG__) {
    return window.__OPSCLAW_FILE_DIALOG__.pickSavePath({
      title: '选择下载保存位置',
      defaultPath,
    });
  }

  return { canceled: false, path: defaultPath ?? null };
}
