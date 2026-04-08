export type InteractionStatus = 'open' | 'submitted' | 'resolved' | 'rejected' | 'expired';

export type InteractionKind =
  | 'collect_input'
  | 'approval'
  | 'danger_confirm'
  | 'terminal_wait'
  | 'inform';

export type InteractionRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type InteractionBlockingMode = 'none' | 'soft_block' | 'hard_block';

export type InteractionField =
  | { type: 'display'; key: string; label?: string; value: string }
  | {
      type: 'text';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'password';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'textarea';
      key: string;
      label: string;
      required?: boolean;
      value?: string;
      placeholder?: string;
    }
  | {
      type: 'single_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string;
    }
  | {
      type: 'multi_select';
      key: string;
      label: string;
      required?: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value?: string[];
    }
  | { type: 'confirm'; key: string; label: string; required?: boolean; value?: boolean };

export type InteractionAction = {
  id: string;
  label: string;
  kind: 'submit' | 'approve' | 'reject' | 'cancel' | 'continue_waiting' | 'acknowledge';
  style: 'primary' | 'secondary' | 'danger';
};

export type InteractionRequest = {
  id: string;
  runId: string;
  sessionId: string;
  status: InteractionStatus;
  interactionKind: InteractionKind;
  riskLevel: InteractionRiskLevel;
  blockingMode: InteractionBlockingMode;
  title: string;
  message: string;
  schemaVersion: 'v1';
  fields: InteractionField[];
  actions: InteractionAction[];
  openedAt: number;
  deadlineAt: number | null;
  metadata: Record<string, unknown>;
};
