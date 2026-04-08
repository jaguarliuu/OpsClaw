import type {
  ParameterSource,
  ProtectedParameterName,
} from './controlledExecutionTypes.js';

export type ParameterConfirmationField = {
  name: ProtectedParameterName;
  label: string;
  value: string;
  required: boolean;
  source: ParameterSource;
};
