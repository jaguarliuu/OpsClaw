import { useState } from 'react';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importNodesFromCSV, type ImportResult } from './api';
import { readCsvImportFile } from './csvImportModel';
import {
  SETTINGS_PANEL_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from './settingsTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function CsvImportModal({ open, onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResults(null);
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    try {
      const text = await readCsvImportFile(file);
      const importResults = await importNodesFromCSV(text);
      setResults(importResults);
      if (importResults.every((r) => r.success)) {
        onSuccess();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'CSV 导入失败');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResults(null);
    onClose();
  };

  const successCount = results?.filter(r => r.success).length || 0;
  const failCount = results?.filter(r => !r.success).length || 0;

  const handleDownloadTemplate = () => {
    const template = `name,host,port,username,authMode,password,privateKey,passphrase,groupName,jumpHostId
生产服务器1,192.168.1.100,22,root,password,mypassword,,,,
测试服务器2,192.168.1.101,22,admin,privateKey,,"-----BEGIN RSA PRIVATE KEY-----
...your private key here...
-----END RSA PRIVATE KEY-----",mypassphrase,测试环境,`;
    const blob = new Blob(['\uFEFF', template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opsclaw-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">批量导入节点</DialogTitle>
          <DialogDescription className={`mt-1 ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
            从 CSV 文件批量导入服务器节点
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className={`${SETTINGS_PANEL_CLASS} space-y-2 p-4`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-xs font-medium ${SETTINGS_TEXT_SECONDARY_CLASS}`}>CSV 格式说明</div>
              <button
                onClick={handleDownloadTemplate}
                className="text-xs text-blue-500 transition-colors hover:text-blue-400"
              >
                下载模板
              </button>
            </div>
            <div className={`font-mono text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
              name,host,port,username,authMode,password,privateKey,passphrase,groupName,jumpHostId
            </div>
            <div className={`mt-2 text-xs ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
              必填：name, host, port, username, authMode（password 或 privateKey）
            </div>
          </div>

          <div className="space-y-3">
            <label className="relative flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--app-border-default)] bg-[var(--app-bg-base)]/70 transition-colors hover:border-[var(--app-border-strong)]">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-[var(--app-text-tertiary)]" />
                <div className={`text-sm ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                  {file ? file.name : '点击选择 CSV 文件'}
                </div>
              </div>
            </label>

            <Button
              onClick={() => {
                void handleImport();
              }}
              disabled={!file || importing}
              className="w-full h-10 bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </div>

          {results && (
            <div className="space-y-3">
              <div className={`${SETTINGS_PANEL_CLASS} flex items-center justify-between p-3`}>
                <div className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>导入结果</div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-400">成功：{successCount}</span>
                  <span className="text-red-400">失败：{failCount}</span>
                </div>
              </div>
              <div className={`${SETTINGS_PANEL_CLASS} max-h-80 space-y-2 overflow-auto p-3`}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`text-xs p-3 rounded-lg border transition-colors ${
                      r.success
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/5 border-red-500/20 text-red-400'
                    }`}
                  >
                    <span className="font-medium">第 {r.row} 行：</span>
                    {r.success ? `✓ ${r.name}` : `✗ ${r.error}`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
