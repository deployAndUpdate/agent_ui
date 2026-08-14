import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import tuiManifestSchema from '../schemas/tui-manifest.schema.json' with { type: 'json' };
import paragraphProps from '../schemas/props/Paragraph.props.schema.json' with { type: 'json' };
import tableProps from '../schemas/props/Table.props.schema.json' with { type: 'json' };
import listProps from '../schemas/props/List.props.schema.json' with { type: 'json' };
import gaugeProps from '../schemas/props/Gauge.props.schema.json' with { type: 'json' };
import chartProps from '../schemas/props/Chart.props.schema.json' with { type: 'json' };
import type { TuiManifest, TuiWidgetType, ValidationResult } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(tuiManifestSchema);

const propsValidators: Record<TuiWidgetType, ValidateFunction> = {
  Paragraph: ajv.compile(paragraphProps),
  Table: ajv.compile(tableProps),
  List: ajv.compile(listProps),
  Gauge: ajv.compile(gaugeProps),
  Chart: ajv.compile(chartProps),
};

function formatError(error: ErrorObject, prefix = ''): string {
  const path = `${prefix}${error.instancePath || '/'}`;
  return `${path}: ${error.message ?? 'invalid'}${
    error.params ? ` (${JSON.stringify(error.params)})` : ''
  }`;
}

function validateChunkProps(manifest: TuiManifest): string[] {
  if (manifest.operation === 'REMOVE_WIDGET') {
    return [];
  }
  const errors: string[] = [];
  manifest.layout.chunks.forEach((chunk, index) => {
    const validator = propsValidators[chunk.type];
    if (!validator) return;
    const ok = validator(chunk.props);
    if (!ok) {
      for (const err of validator.errors ?? []) {
        errors.push(formatError(err, `/layout/chunks/${index}/props`));
      }
    }
  });
  return errors;
}

export function validateTuiManifest(payload: unknown): ValidationResult<TuiManifest> {
  const ok = validate(payload);
  if (!ok) {
    const errors = (validate.errors ?? []).map((e) => formatError(e));
    return { ok: false, errors: errors.length > 0 ? errors : ['unknown validation error'] };
  }

  const data = payload as TuiManifest;
  const propErrors = validateChunkProps(data);
  if (propErrors.length > 0) {
    return { ok: false, errors: propErrors };
  }
  return { ok: true, data };
}
