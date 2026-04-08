import type { AgentStreamEvent, InteractionRequest } from './types.agent';

export type PendingInteractionKind = 'approval' | 'collect_input' | 'danger_confirm';

export type PendingInteractionItem = {
  requestId: string;
  gateId: string;
  runId: string;
  sessionId: string;
  interactionKind: PendingInteractionKind;
  kind: 'approval' | 'parameter_confirmation' | 'danger_confirm';
  riskLevel: InteractionRequest['riskLevel'];
  title: string;
  summary: string;
  openedAt: number;
  request: InteractionRequest;
};

export type InteractionFormValue = string | string[] | boolean;

export type InteractionFieldViewModel =
  | { kind: 'display'; key: string; label: string | null; value: string }
  | {
      kind: 'input';
      inputType: 'text' | 'password';
      key: string;
      label: string;
      required: boolean;
      value: string;
      placeholder?: string;
    }
  | {
      kind: 'textarea';
      key: string;
      label: string;
      required: boolean;
      value: string;
      placeholder?: string;
    }
  | {
      kind: 'single_select';
      key: string;
      label: string;
      required: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value: string;
    }
  | {
      kind: 'multi_select';
      key: string;
      label: string;
      required: boolean;
      options: Array<{ label: string; value: string; description?: string }>;
      value: string[];
    }
  | { kind: 'confirm'; key: string; label: string; required: boolean; value: boolean };

export type InteractionActionViewModel = {
  id: string;
  label: string;
  kind: 'submit' | 'approve' | 'reject' | 'cancel' | 'continue_waiting' | 'acknowledge';
  style: 'primary' | 'secondary' | 'danger';
};

export type InteractionViewModel = {
  id: string;
  runId: string;
  sessionId: string;
  status: InteractionRequest['status'];
  interactionKind: InteractionRequest['interactionKind'];
  title: string;
  message: string;
  riskLevel: InteractionRequest['riskLevel'];
  blockingMode: InteractionRequest['blockingMode'];
  openedAt: number;
  deadlineAt: number | null;
  showInPendingQueue: boolean;
  fields: InteractionFieldViewModel[];
  actions: InteractionActionViewModel[];
};

const PENDING_INTERACTION_KIND_ORDER: Record<PendingInteractionKind, number> = {
  approval: 0,
  danger_confirm: 1,
  collect_input: 2,
};

function sortPendingInteractionItems(items: PendingInteractionItem[]) {
  return [...items].sort((left, right) => {
    const kindOrder =
      PENDING_INTERACTION_KIND_ORDER[left.interactionKind] -
      PENDING_INTERACTION_KIND_ORDER[right.interactionKind];
    if (kindOrder !== 0) {
      return kindOrder;
    }

    if (left.openedAt !== right.openedAt) {
      return left.openedAt - right.openedAt;
    }

    return left.requestId.localeCompare(right.requestId);
  });
}

function toPendingInteractionKind(
  interactionKind: InteractionRequest['interactionKind']
): PendingInteractionKind | null {
  if (
    interactionKind !== 'approval' &&
    interactionKind !== 'collect_input' &&
    interactionKind !== 'danger_confirm'
  ) {
    return null;
  }

  return interactionKind;
}

export function toPendingInteractionItem(
  request: InteractionRequest
): PendingInteractionItem | null {
  if (request.status !== 'open') {
    return null;
  }

  const pendingKind = toPendingInteractionKind(request.interactionKind);
  if (!pendingKind) {
    return null;
  }

  return {
    requestId: request.id,
    gateId: request.id,
    runId: request.runId,
    sessionId: request.sessionId,
    interactionKind: pendingKind,
    kind:
      pendingKind === 'collect_input'
        ? 'parameter_confirmation'
        : pendingKind,
    riskLevel: request.riskLevel,
    title: request.title,
    summary: request.message,
    openedAt: request.openedAt,
    request,
  };
}

export function buildPendingInteractionItems(
  requests: InteractionRequest[]
): PendingInteractionItem[] {
  return sortPendingInteractionItems(
    requests
      .map((request) => toPendingInteractionItem(request))
      .filter((item): item is PendingInteractionItem => item !== null)
  );
}

export function reducePendingInteractionItems(
  items: PendingInteractionItem[],
  event: Extract<
    AgentStreamEvent,
    | { type: 'interaction_requested' }
    | { type: 'interaction_updated' }
    | { type: 'interaction_resolved' }
    | { type: 'interaction_rejected' }
    | { type: 'interaction_expired' }
  >
) {
  const filtered = items.filter((item) => item.runId !== event.runId);
  if (
    event.type === 'interaction_resolved' ||
    event.type === 'interaction_rejected' ||
    event.type === 'interaction_expired'
  ) {
    return filtered;
  }

  const nextItem = toPendingInteractionItem(event.request);
  if (!nextItem) {
    return filtered;
  }

  return sortPendingInteractionItems([...filtered, nextItem]);
}

function mapInteractionField(
  field: InteractionRequest['fields'][number]
): InteractionFieldViewModel {
  if (field.type === 'display') {
    return {
      kind: 'display',
      key: field.key,
      label: field.label ?? null,
      value: field.value,
    };
  }

  if (field.type === 'text' || field.type === 'password') {
    return {
      kind: 'input',
      inputType: field.type,
      key: field.key,
      label: field.label,
      required: field.required === true,
      value: field.value ?? '',
      placeholder: field.placeholder,
    };
  }

  if (field.type === 'textarea') {
    return {
      kind: 'textarea',
      key: field.key,
      label: field.label,
      required: field.required === true,
      value: field.value ?? '',
      placeholder: field.placeholder,
    };
  }

  if (field.type === 'single_select') {
    return {
      kind: 'single_select',
      key: field.key,
      label: field.label,
      required: field.required === true,
      options: field.options,
      value: field.value ?? '',
    };
  }

  if (field.type === 'multi_select') {
    return {
      kind: 'multi_select',
      key: field.key,
      label: field.label,
      required: field.required === true,
      options: field.options,
      value: field.value ?? [],
    };
  }

  return {
    kind: 'confirm',
    key: field.key,
    label: field.label,
    required: field.required === true,
    value: field.value ?? false,
  };
}

function mapInteractionAction(
  action: InteractionRequest['actions'][number]
): InteractionActionViewModel {
  return {
    id: action.id,
    label: action.label,
    kind: action.kind,
    style: action.style,
  };
}

export function toInteractionViewModel(request: InteractionRequest): InteractionViewModel {
  return {
    id: request.id,
    runId: request.runId,
    sessionId: request.sessionId,
    status: request.status,
    interactionKind: request.interactionKind,
    title: request.title,
    message: request.message,
    riskLevel: request.riskLevel,
    blockingMode: request.blockingMode,
    openedAt: request.openedAt,
    deadlineAt: request.deadlineAt,
    showInPendingQueue: toPendingInteractionItem(request) !== null,
    fields: request.fields.map(mapInteractionField),
    actions: request.actions.map(mapInteractionAction),
  };
}

export function createInteractionFormValues(
  request: InteractionRequest
): Record<string, InteractionFormValue> {
  const view = toInteractionViewModel(request);
  return view.fields.reduce<Record<string, InteractionFormValue>>((values, field) => {
    if (field.kind === 'display') {
      return values;
    }

    values[field.key] = field.value;
    return values;
  }, {});
}

function isEmptyInteractionValue(value: InteractionFormValue | undefined) {
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (typeof value === 'boolean') {
    return value !== true;
  }

  return !value || value.length === 0;
}

export function validateInteractionSubmission(input: {
  request: InteractionRequest;
  actionId: string;
  values: Record<string, InteractionFormValue>;
}) {
  const action = input.request.actions.find((candidate) => candidate.id === input.actionId);
  if (!action) {
    return { ok: false as const, message: '未找到要提交的交互动作。' };
  }

  if (action.kind !== 'submit' && action.kind !== 'approve') {
    return { ok: true as const };
  }

  const requiredField = toInteractionViewModel(input.request).fields.find((field) => {
    if (field.kind === 'display') {
      return false;
    }

    return field.required && isEmptyInteractionValue(input.values[field.key]);
  });

  if (!requiredField) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    message: `请先完成「${requiredField.label}」后再继续。`,
  };
}

export function buildInteractionSubmissionPayload(
  request: InteractionRequest,
  values: Record<string, InteractionFormValue>
) {
  const payloadFields = request.fields.reduce<Record<string, InteractionFormValue>>(
    (result, field) => {
      if (field.type === 'display') {
        return result;
      }

      if (values[field.key] === undefined) {
        return result;
      }

      result[field.key] = values[field.key];
      return result;
    },
    {}
  );

  return { fields: payloadFields };
}
