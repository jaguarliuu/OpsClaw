# 全局主题系统使用指南

## 概述

OpsClaw 现在支持全局主题系统，主题会影响整个应用的 UI（不仅仅是终端）。

## 可用主题

- **OpsClaw Dark**（默认）：自定义深色主题
- **Dracula**：经典 Dracula 配色
- **Catppuccin Mocha**：柔和的深色主题
- **Solarized Dark**：Solarized 深色版本
- **Light**：浅色主题

## CSS 变量

主题系统通过 CSS 变量实现，所有变量在 `document.documentElement` 上设置：

### 背景色
- `--app-bg-base`：基础背景色
- `--app-bg-elevated`：提升层级背景色
- `--app-bg-elevated2`：二级提升背景色
- `--app-bg-elevated3`：三级提升背景色

### 文字色
- `--app-text-primary`：主要文字色
- `--app-text-secondary`：次要文字色
- `--app-text-tertiary`：弱化文字色

### 边框色
- `--app-border-default`：默认边框色
- `--app-border-strong`：强调边框色

### 强调色
- `--app-accent-primary`：主要强调色
- `--app-accent-primary-hover`：主要强调色悬停态

### 状态色
- `--app-status-success`：成功状态色
- `--app-status-warning`：警告状态色
- `--app-status-error`：错误状态色

## 在组件中使用

### 方式 1：直接使用 CSS 变量（推荐）

```tsx
<div style={{ backgroundColor: 'var(--app-bg-elevated)' }}>
  <span style={{ color: 'var(--app-text-primary)' }}>文本</span>
</div>
```

### 方式 2：使用 Tailwind 的 arbitrary values

```tsx
<div className="bg-[var(--app-bg-elevated)]">
  <span className="text-[var(--app-text-primary)]">文本</span>
</div>
```

### 方式 3：在 CSS 文件中使用

```css
.my-component {
  background-color: var(--app-bg-elevated);
  color: var(--app-text-primary);
  border-color: var(--app-border-default);
}
```

## 迁移现有组件

将硬编码的颜色替换为 CSS 变量：

**之前：**
```tsx
<div className="bg-[#141519] text-neutral-100 border-neutral-800">
```

**之后：**
```tsx
<div className="bg-[var(--app-bg-elevated)] text-[var(--app-text-primary)] border-[var(--app-border-default)]">
```

## 在 React 组件中访问主题

```tsx
import { useTerminalSettings } from '@/features/workbench/TerminalSettingsContext';

function MyComponent() {
  const { appTheme } = useTerminalSettings();

  // appTheme.mode: 'dark' | 'light'
  // appTheme.bg.base, appTheme.text.primary, etc.

  return <div style={{ backgroundColor: appTheme.bg.elevated }}>...</div>;
}
```

## 添加新主题

1. 在 `src/features/workbench/terminalSettings.ts` 中：
   - 添加新的 `TerminalThemeName`
   - 在 `TERMINAL_THEMES` 中定义终端配色
   - 在 `APP_THEMES` 中定义应用配色

2. 在 `src/features/workbench/TerminalSettingsPanel.tsx` 中：
   - 将新主题名称添加到 `THEME_NAMES` 数组

## 注意事项

- 主题切换是实时的，无需刷新页面
- 主题设置保存在 localStorage 中
- Light 主题现在是真正的浅色主题，影响整个应用
