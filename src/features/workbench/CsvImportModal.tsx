import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importNodesFromCSV, type ImportResult } from './api';

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
      const text = await file.text();
      const importResults = await importNodesFromCSV(text);
      setResults(importResults);
      if (importResults.every(r => r.success)) {
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
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opsclaw-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-[#17181b] border-neutral-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">批量导入节点</DialogTitle>
          <p className="text-sm text-neutral-500 mt-1">从 CSV 文件批量导入服务器节点</p>
        </DialogHeader>

        <div className="space-y-6">
          <div className="p-4 bg-[#0a0b0d] rounded-lg border border-neutral-800/50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-500 font-medium">CSV 格式说明</div>
              <button
                onClick={handleDownloadTemplate}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                下载模板
              </button>
            </div>
            <div className="text-xs text-neutral-600 font-mono">
              name,host,port,username,authMode,password,privateKey,passphrase,groupName,jumpHostId
            </div>
            <div className="text-xs text-neutral-500 mt-2">
              必填：name, host, port, username, authMode（password 或 privateKey）
            </div>
          </div>

          <div className="space-y-3">
            <label className="relative flex items-center justify-center h-32 border-2 border-dashed border-neutral-800 rounded-lg hover:border-[var(--app-border-strong)] transition-colors cursor-pointer bg-[#0a0b0d]/30">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-neutral-600" />
                <div className="text-sm text-neutral-400">
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
              <div className="flex items-center justify-between p-3 bg-[#0a0b0d] rounded-lg border border-neutral-800/50">
                <div className="text-sm font-medium text-neutral-300">导入结果</div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-400">成功：{successCount}</span>
                  <span className="text-red-400">失败：{failCount}</span>
                </div>
              </div>
              <div className="max-h-80 overflow-auto space-y-2 p-3 bg-[#0a0b0d] rounded-lg border border-neutral-800/50">
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
