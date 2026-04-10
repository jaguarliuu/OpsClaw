import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/SectionCard';
import { buildInspectionScriptSettingsPath } from '@/features/workbench/settingsNavigation';
import {
  SETTINGS_PANEL_MUTED_CLASS,
  SETTINGS_TEXT_PRIMARY_CLASS,
  SETTINGS_TEXT_SECONDARY_CLASS,
  SETTINGS_TEXT_TERTIARY_CLASS,
} from '@/features/workbench/settingsTheme';

import {
  buildNodeDashboardPresentationModel,
} from './nodeDashboardModel.js';
import type { NodeDashboardPayload } from './types.js';

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function NodeStatusDashboardDialog({
  errorMessage,
  isLoading,
  isRefreshing,
  onClose,
  onRefresh,
  open,
  payload,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onClose: () => void;
  onRefresh: () => void;
  open: boolean;
  payload: NodeDashboardPayload | null;
}) {
  const navigate = useNavigate();
  const presentation = useMemo(
    () => buildNodeDashboardPresentationModel({ errorMessage, isLoading, isRefreshing, payload }),
    [errorMessage, isLoading, isRefreshing, payload]
  );
  const viewModel = presentation.viewModel;

  const renderBody = () => {
    if (presentation.mode === 'loading') {
      return (
        <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
          正在读取节点状态...
        </div>
      );
    }

    if (presentation.mode === 'error') {
      return (
        <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-6 text-sm text-red-300`}>
          {presentation.bannerMessage}
        </div>
      );
    }

    if (!payload || !viewModel) {
      return (
        <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
          暂无 dashboard 数据。
        </div>
      );
    }

    if (presentation.mode === 'unsupported') {
      return (
        <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
          当前 dashboard schema 暂不支持前端渲染。
        </div>
      );
    }

    if (presentation.mode === 'empty') {
      return (
        <div className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-6 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
          {isRefreshing ? '正在执行首次采集，请稍候...' : '暂无快照，打开后会自动触发首次采集。'}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {presentation.bannerMessage ? (
          <div
            className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-3 text-sm ${
              presentation.bannerTone === 'error' ? 'text-red-300' : 'text-amber-200'
            }`}
          >
            {presentation.bannerMessage}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-4">
          {viewModel.summaryCards.map((card) => (
            <div
              key={card.id}
              className={`${SETTINGS_PANEL_MUTED_CLASS} px-4 py-3`}
            >
              <div className={`text-xs uppercase tracking-[0.12em] ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                {card.label}
              </div>
              <div className={`mt-2 text-xl font-semibold ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                {card.value}
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {viewModel.modules.map((module) => (
            <SectionCard
              key={module.id}
              title={module.title}
              className="border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)]"
            >
              <div className="grid gap-2">
                {module.rows.map((row) => (
                  <div
                    key={`${module.id}-${row.label}-${row.value}`}
                    className="flex items-start justify-between gap-4 text-sm"
                  >
                    <span className={SETTINGS_TEXT_SECONDARY_CLASS}>{row.label}</span>
                    <span className={`text-right ${SETTINGS_TEXT_PRIMARY_CLASS}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </section>

        <SectionCard
          title="最近快照"
          description="仅展示最近几次采集结果，不提供对比图。"
          className="border-[var(--app-border-default)] bg-[var(--app-bg-elevated2)]"
        >
          <div className="grid gap-3">
            {viewModel.recentSnapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className={`${SETTINGS_PANEL_MUTED_CLASS} flex items-start justify-between gap-4 px-4 py-3`}
              >
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${SETTINGS_TEXT_PRIMARY_CLASS}`}>
                    {snapshot.statusLabel}
                  </div>
                  <div className={`mt-1 text-sm ${SETTINGS_TEXT_SECONDARY_CLASS}`}>
                    {snapshot.detail}
                  </div>
                </div>
                <div className={`shrink-0 text-xs ${SETTINGS_TEXT_TERTIARY_CLASS}`}>
                  {formatDateTime(snapshot.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onClose();
      }
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--app-border-default)] bg-[var(--app-bg-elevated)] p-0 text-[var(--app-text-primary)]">
        <DialogHeader className="block border-[var(--app-border-default)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-[var(--app-text-primary)]">
                {payload?.node.name ?? '节点状态'}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[var(--app-text-secondary)]">
                {payload
                  ? `${payload.node.host} · ${payload.node.username} · 最近采集 ${formatDateTime(viewModel?.latestCollectedAt ?? null)}`
                  : '查看节点最近一次巡检快照与默认 dashboard 摘要。'}
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {payload ? (
                <Button
                  onClick={() => {
                    void navigate(buildInspectionScriptSettingsPath(payload.node.id, payload.profile?.scriptId));
                    onClose();
                  }}
                  size="sm"
                  variant="secondary"
                >
                  编辑巡检脚本
                </Button>
              ) : null}
              <Button
                disabled={isLoading || isRefreshing}
                onClick={onRefresh}
                size="sm"
              >
                {isRefreshing ? '刷新中...' : '立即刷新'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-4">
          {renderBody()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
