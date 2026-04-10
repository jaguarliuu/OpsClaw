import { useCallback, useEffect, useRef, useState } from 'react';

import {
  collectNodeDashboard,
  fetchNodeDashboard,
} from './nodeDashboardApi.js';
import type { NodeDashboardPayload } from './types.js';

export function buildOpenedNodeStatusDashboardState(
  current: {
    open: boolean;
    nodeId: string | null;
    payload: NodeDashboardPayload | null;
    errorMessage: string | null;
  },
  targetNodeId: string
) {
  return {
    ...current,
    open: true,
    nodeId: targetNodeId,
    payload: null,
    errorMessage: null,
  };
}

export function shouldApplyNodeStatusDashboardResponse(input: {
  requestId: number;
  latestRequestId: number;
  requestedNodeId: string;
  activeNodeId: string | null;
}) {
  return (
    input.requestId === input.latestRequestId &&
    input.requestedNodeId === input.activeNodeId
  );
}

export function useNodeStatusDashboard() {
  const [open, setOpen] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [payload, setPayload] = useState<NodeDashboardPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoCollectRequestedRef = useRef<string | null>(null);
  const loadRequestIdRef = useRef(0);
  const refreshRequestIdRef = useRef(0);

  const loadDashboard = useCallback(async (targetNodeId: string) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextPayload = await fetchNodeDashboard(targetNodeId);
      if (
        !shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: loadRequestIdRef.current,
          requestedNodeId: targetNodeId,
          activeNodeId: nodeId,
        })
      ) {
        return;
      }
      setPayload(nextPayload);
    } catch (error) {
      if (
        !shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: loadRequestIdRef.current,
          requestedNodeId: targetNodeId,
          activeNodeId: nodeId,
        })
      ) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '节点 dashboard 读取失败。');
      setPayload(null);
    } finally {
      if (
        shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: loadRequestIdRef.current,
          requestedNodeId: targetNodeId,
          activeNodeId: nodeId,
        })
      ) {
        setIsLoading(false);
      }
    }
  }, [nodeId]);

  const refreshDashboard = useCallback(async () => {
    if (!nodeId) {
      return;
    }

    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const nextPayload = await collectNodeDashboard(nodeId);
      if (
        !shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          requestedNodeId: nodeId,
          activeNodeId: nodeId,
        })
      ) {
        return;
      }
      setPayload(nextPayload);
    } catch (error) {
      if (
        shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          requestedNodeId: nodeId,
          activeNodeId: nodeId,
        })
      ) {
        setErrorMessage(error instanceof Error ? error.message : '节点 dashboard 采集失败。');
      }
    } finally {
      if (
        shouldApplyNodeStatusDashboardResponse({
          requestId,
          latestRequestId: refreshRequestIdRef.current,
          requestedNodeId: nodeId,
          activeNodeId: nodeId,
        })
      ) {
        setIsRefreshing(false);
      }
    }
  }, [nodeId]);

  const openDashboard = useCallback((targetNodeId: string) => {
    autoCollectRequestedRef.current = null;
    loadRequestIdRef.current += 1;
    refreshRequestIdRef.current += 1;
    const nextState = buildOpenedNodeStatusDashboardState(
      {
        errorMessage: null,
        nodeId: null,
        open: false,
        payload: null,
      },
      targetNodeId
    );
    setPayload(nextState.payload);
    setErrorMessage(nextState.errorMessage);
    setNodeId(nextState.nodeId);
    setOpen(nextState.open);
    setIsRefreshing(false);
  }, []);

  const closeDashboard = useCallback(() => {
    autoCollectRequestedRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open || !nodeId) {
      return;
    }

    void loadDashboard(nodeId);
  }, [loadDashboard, nodeId, open]);

  useEffect(() => {
    if (!open || !nodeId || isLoading || isRefreshing || payload === null) {
      return;
    }

    if (payload.latestSnapshot !== null) {
      return;
    }

    if (autoCollectRequestedRef.current === nodeId) {
      return;
    }

    autoCollectRequestedRef.current = nodeId;
    void refreshDashboard();
  }, [isLoading, isRefreshing, nodeId, open, payload, refreshDashboard]);

  return {
    closeDashboard,
    errorMessage,
    isLoading,
    isRefreshing,
    nodeId,
    open,
    openDashboard,
    payload,
    refreshDashboard,
  };
}
