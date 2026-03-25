import { useState } from 'react';

import { SectionCard } from '@/components/ui/SectionCard';
import { batchExecutionRows } from '@/features/workbench/data';

const drawerTabs = [
  { id: 'fleet', label: '批量执行' },
  { id: 'inspection', label: '巡检任务' },
  { id: 'audit', label: '审计日志' },
  { id: 'ai', label: 'AI 摘要' },
] as const;

export function UtilityDrawer() {
  const [activeTab, setActiveTab] = useState<(typeof drawerTabs)[number]['id']>('fleet');

  return (
    <section className="utility-drawer utility-drawer--compact">
      <header className="utility-drawer__header utility-drawer__header--compact">
        <div className="utility-drawer__tabs">
          {drawerTabs.map((tab) => (
            <button
              className={`utility-drawer__tab${tab.id === activeTab ? ' utility-drawer__tab--active' : ''}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="utility-drawer__caption">主终端优先，辅助面板只做补充</span>
      </header>

      <div className="utility-drawer__body utility-drawer__body--compact">
        {activeTab === 'fleet' ? (
          <div className="compact-grid">
            <SectionCard title="批量执行" description="当前版本保留简单分组执行配置。">
              <div className="pill-list">
                <span className="status-pill">并发 16</span>
                <span className="status-pill">超时 45s</span>
                <span className="status-pill">生产确认</span>
              </div>
            </SectionCard>

            <SectionCard title="最近结果" description="仅显示当前命令的摘要结果。">
              <div className="data-table">
                <div className="data-table__head data-table__head--five">
                  <span>Node</span>
                  <span>Service</span>
                  <span>Disk</span>
                  <span>Latency</span>
                  <span>Status</span>
                </div>
                {batchExecutionRows.slice(0, 3).map((row) => (
                  <div className="data-table__row data-table__row--five" key={row.node}>
                    <div>
                      <strong>{row.node}</strong>
                      <span>{row.node.includes('master') ? 'master' : 'replica'}</span>
                    </div>
                    <span>{row.service}</span>
                    <span>{row.disk}</span>
                    <span>{row.latency}</span>
                    <span className={`status-badge status-badge--${row.tone}`}>{row.status}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'inspection' ? (
          <div className="compact-grid">
            <SectionCard title="巡检模板" description="固定模板，避免首版过度平台化。">
              <div className="pill-list">
                <span className="status-pill">Disk sweep</span>
                <span className="status-pill">Failed units</span>
                <span className="status-pill">Log sentinel</span>
              </div>
            </SectionCard>
            <SectionCard title="调度状态" description="当前只保留少量关键信息。">
              <div className="pill-list">
                <span className="status-pill">prod-redis / 11:30</span>
                <span className="status-pill">market-core / 12:00</span>
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'audit' ? (
          <SectionCard title="审计日志" description="终端、批量执行和 AI 触发都统一留痕。">
            <div className="data-table">
              <div className="data-table__head data-table__head--four">
                <span>Time</span>
                <span>Event</span>
                <span>Mode</span>
                <span>State</span>
              </div>
              <div className="data-table__row data-table__row--four">
                <span>11:04</span>
                <div>
                  <strong>batch execution started</strong>
                  <span>prod-redis / 8 nodes / ops-jaguarliu</span>
                </div>
                <span>manual</span>
                <span className="status-badge status-badge--ok">logged</span>
              </div>
              <div className="data-table__row data-table__row--four">
                <span>10:42</span>
                <div>
                  <strong>terminal opened</strong>
                  <span>redis-master-02 / route sh-a-01 / transcript on</span>
                </div>
                <span>interactive</span>
                <span className="status-badge status-badge--ok">logged</span>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {activeTab === 'ai' ? (
          <div className="compact-grid">
            <SectionCard title="当前摘要" description="只做解释，不抢终端焦点。">
              <p className="prose">
                Redis 集群整体健康，当前风险集中在副本节点磁盘压力，以及单台 edge 节点的 sidecar
                失败，没有出现 master 级联故障迹象。
              </p>
            </SectionCard>
            <SectionCard title="建议动作" description="偏结构化输出，方便后续执行。">
              <div className="pill-list">
                <span className="status-pill">检查 /data 增长</span>
                <span className="status-pill">确认日志轮转</span>
                <span className="status-pill">30 分钟后重跑巡检</span>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </section>
  );
}
