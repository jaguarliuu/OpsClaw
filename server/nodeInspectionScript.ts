export type NodeInspectionScriptDefinition = {
  key: string;
  alias: string;
  schemaKey: string;
  content: string;
};

export const LEGACY_DEFAULT_NODE_INSPECTION_SCRIPT_CONTENT = `printf '%s\n' '{"status":"ok"}'`;

export function isLegacyDefaultNodeInspectionScriptContent(content: string) {
  const trimmed = content.trim();

  if (trimmed === LEGACY_DEFAULT_NODE_INSPECTION_SCRIPT_CONTENT.trim()) {
    return true;
  }

  if (
    trimmed.includes('printf \\"%.1f\\"') ||
    trimmed.includes('print $2\\" \\"$3\\" \\"$5')
  ) {
    return true;
  }

  if (
    trimmed.includes('read_cpu_stat()') &&
    trimmed.includes('function sum_fields(value, parts,    total, index)') &&
    trimmed.includes('function idle_fields(value, parts)')
  ) {
    return true;
  }

  return (
    trimmed.includes('json_escape()') &&
    trimmed.includes('read_first_line()') &&
    trimmed.includes('CPU_USAGE_PERCENT="null"') &&
    trimmed.includes('/proc/cpuinfo') &&
    !trimmed.includes('read_cpu_stat()') &&
    !trimmed.includes('/proc/stat')
  );
}

export const DEFAULT_NODE_INSPECTION_SCRIPT: NodeInspectionScriptDefinition = {
  key: 'default_system_dashboard',
  alias: 'dashboard',
  schemaKey: 'default_system',
  content: `
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}

read_first_line() {
  awk 'NF { print; exit }'
}

read_cpu_stat() {
  awk '/^cpu / {print $2" "$3" "$4" "$5" "$6" "$7" "$8" "$9; exit }' /proc/stat 2>/dev/null
}

COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
HOSTNAME_VALUE="$(hostname 2>/dev/null | read_first_line)"
PLATFORM_VALUE="$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' | read_first_line)"
KERNEL_VALUE="$(uname -r 2>/dev/null | read_first_line)"

UPTIME_SECONDS="null"
if [ -r /proc/uptime ]; then
  UPTIME_SECONDS="$(awk '{print int($1)}' /proc/uptime 2>/dev/null || printf 'null')"
fi

CPU_MODEL="$(awk -F: '/model name/ {gsub(/^[ \t]+/, "", $2); print $2; exit }' /proc/cpuinfo 2>/dev/null | read_first_line)"
if [ -z "$CPU_MODEL" ]; then
  CPU_MODEL="$(sysctl -n machdep.cpu.brand_string 2>/dev/null | read_first_line)"
fi
CPU_CORES="$(getconf _NPROCESSORS_ONLN 2>/dev/null | read_first_line)"
if [ -z "$CPU_CORES" ]; then
  CPU_CORES="$(sysctl -n hw.ncpu 2>/dev/null | read_first_line)"
fi
CPU_CORES="\${CPU_CORES:-null}"
CPU_USAGE_PERCENT="null"
if [ -r /proc/stat ]; then
  CPU_STAT_1="$(read_cpu_stat)"
  if [ -n "$CPU_STAT_1" ]; then
    sleep 1
    CPU_STAT_2="$(read_cpu_stat)"
    if [ -n "$CPU_STAT_2" ]; then
      CPU_USAGE_PERCENT="$(awk -v first="$CPU_STAT_1" -v second="$CPU_STAT_2" '
BEGIN {
  split(first, first_parts, " ")
  split(second, second_parts, " ")
  total_1 = 0
  total_2 = 0
  for (i = 1; i <= 8; i++) {
    total_1 += first_parts[i] + 0
    total_2 += second_parts[i] + 0
  }
  idle_1 = (first_parts[4] + 0) + (first_parts[5] + 0)
  idle_2 = (second_parts[4] + 0) + (second_parts[5] + 0)
  total_delta = total_2 - total_1
  idle_delta = idle_2 - idle_1
  if (total_delta > 0) {
    printf "%.1f", (1 - idle_delta / total_delta) * 100
  } else {
    printf "null"
  }
}')"
    fi
  fi
fi

MEMORY_TOTAL_BYTES="null"
MEMORY_USED_BYTES="null"
MEMORY_AVAILABLE_BYTES="null"
MEMORY_USAGE_PERCENT="null"
if [ -r /proc/meminfo ]; then
  MEMORY_TOTAL_KB="$(awk '/MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  MEMORY_AVAILABLE_KB="$(awk '/MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  if [ -n "$MEMORY_TOTAL_KB" ] && [ -n "$MEMORY_AVAILABLE_KB" ]; then
    MEMORY_TOTAL_BYTES="$((MEMORY_TOTAL_KB * 1024))"
    MEMORY_AVAILABLE_BYTES="$((MEMORY_AVAILABLE_KB * 1024))"
    MEMORY_USED_BYTES="$((MEMORY_TOTAL_BYTES - MEMORY_AVAILABLE_BYTES))"
    MEMORY_USAGE_PERCENT="$(awk -v used="$MEMORY_USED_BYTES" -v total="$MEMORY_TOTAL_BYTES" 'BEGIN { if (total > 0) printf "%.1f", (used / total) * 100; else printf "null" }')"
  fi
fi

DISK_TOTAL_BYTES="null"
DISK_USED_BYTES="null"
DISK_USAGE_PERCENT="null"
DISK_DF_LINE="$(df -P -k / 2>/dev/null | awk 'NR==2 {print $2" "$3" "$5; exit}')"
if [ -n "$DISK_DF_LINE" ]; then
  DISK_TOTAL_KB="$(printf '%s' "$DISK_DF_LINE" | awk '{print $1}')"
  DISK_USED_KB="$(printf '%s' "$DISK_DF_LINE" | awk '{print $2}')"
  DISK_USE_RAW="$(printf '%s' "$DISK_DF_LINE" | awk '{gsub(/%/, "", $3); print $3}')"
  if [ -n "$DISK_TOTAL_KB" ] && [ -n "$DISK_USED_KB" ]; then
    DISK_TOTAL_BYTES="$((DISK_TOTAL_KB * 1024))"
    DISK_USED_BYTES="$((DISK_USED_KB * 1024))"
  fi
  DISK_USAGE_PERCENT="\${DISK_USE_RAW:-null}"
fi

LOAD_1="null"
LOAD_5="null"
LOAD_15="null"
if [ -r /proc/loadavg ]; then
  LOAD_VALUES="$(awk '{print $1" "$2" "$3}' /proc/loadavg 2>/dev/null)"
  LOAD_1="$(printf '%s' "$LOAD_VALUES" | awk '{print $1}')"
  LOAD_5="$(printf '%s' "$LOAD_VALUES" | awk '{print $2}')"
  LOAD_15="$(printf '%s' "$LOAD_VALUES" | awk '{print $3}')"
fi

printf '{'
printf '"schemaVersion":1,'
printf '"collectedAt":"%s",' "$(json_escape "$COLLECTED_AT")"
printf '"system":{"hostname":"%s","platform":"%s","kernel":"%s","uptimeSeconds":%s},' "$(json_escape "\${HOSTNAME_VALUE:-unknown}")" "$(json_escape "\${PLATFORM_VALUE:-unknown}")" "$(json_escape "\${KERNEL_VALUE:-unknown}")" "\${UPTIME_SECONDS:-null}"
printf '"cpu":{"model":"%s","cores":%s,"usagePercent":%s},' "$(json_escape "\${CPU_MODEL:-unknown}")" "\${CPU_CORES:-null}" "\${CPU_USAGE_PERCENT:-null}"
printf '"memory":{"totalBytes":%s,"usedBytes":%s,"availableBytes":%s,"usagePercent":%s},' "\${MEMORY_TOTAL_BYTES:-null}" "\${MEMORY_USED_BYTES:-null}" "\${MEMORY_AVAILABLE_BYTES:-null}" "\${MEMORY_USAGE_PERCENT:-null}"
printf '"disk":{"rootTotalBytes":%s,"rootUsedBytes":%s,"rootUsagePercent":%s,"filesystems":[{"mount":"/","usagePercent":%s}]},' "\${DISK_TOTAL_BYTES:-null}" "\${DISK_USED_BYTES:-null}" "\${DISK_USAGE_PERCENT:-null}" "\${DISK_USAGE_PERCENT:-null}"
printf '"load":{"load1":%s,"load5":%s,"load15":%s},' "\${LOAD_1:-null}" "\${LOAD_5:-null}" "\${LOAD_15:-null}"
printf '"services":[]'
printf '}\n'
`.trim(),
};
