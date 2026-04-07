import type { ParameterConfirmationField } from './types.agent';

export type ParameterGateFormState = {
  fields: ParameterConfirmationField[];
  values: Record<string, string>;
};

export function buildParameterGateFormState(input: {
  fields: ParameterConfirmationField[];
}): ParameterGateFormState {
  return {
    fields: input.fields,
    values: Object.fromEntries(input.fields.map((field) => [field.name, field.value])),
  };
}

export function updateParameterGateFormValue(
  state: ParameterGateFormState,
  name: string,
  value: string
): ParameterGateFormState {
  return {
    ...state,
    values: {
      ...state.values,
      [name]: value,
    },
  };
}

export function validateParameterGateSubmission(state: ParameterGateFormState) {
  const missing = state.fields
    .filter((field) => field.required && !state.values[field.name]?.trim())
    .map((field) => field.name);

  if (missing.length > 0) {
    return {
      ok: false as const,
      missing,
    };
  }

  return {
    ok: true as const,
  };
}

export function buildParameterGateResolveInput(state: ParameterGateFormState): {
  fields: Record<string, string>;
} {
  return {
    fields: state.values,
  };
}
