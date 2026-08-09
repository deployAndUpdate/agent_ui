import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import dashboardManifestSchema from '../schemas/dashboard-manifest.schema.json' with { type: 'json' };
import metricCardProps from '../schemas/props/MetricCard.props.schema.json' with { type: 'json' };
import dataChartProps from '../schemas/props/DataChart.props.schema.json' with { type: 'json' };
import actionLogProps from '../schemas/props/ActionLog.props.schema.json' with { type: 'json' };
import dataTableProps from '../schemas/props/DataTable.props.schema.json' with { type: 'json' };
import type { DashboardManifest, ValidationResult, WidgetType } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(dashboardManifestSchema);

const propsValidators: Record<WidgetType, ValidateFunction> = {
  MetricCard: ajv.compile(metricCardProps),
  DataChart: ajv.compile(dataChartProps),
  ActionLog: ajv.compile(actionLogProps),
  DataTable: ajv.compile(dataTableProps),
};

function formatError(error: ErrorObject, prefix = ''): string {
  const path = `${prefix}${error.instancePath || '/'}`;
  return `${path}: ${error.message ?? 'invalid'}${
    error.params ? ` (${JSON.stringify(error.params)})` : ''
  }`;
}

function validateWidgetProps(manifest: DashboardManifest): string[] {
  if (manifest.operation === 'REMOVE_WIDGET') {
    return [];
  }
  const errors: string[] = [];
  manifest.layout.widgets.forEach((widget, index) => {
    const validator = propsValidators[widget.type];
    if (!validator) return;
    const ok = validator(widget.props);
    if (!ok) {
      for (const err of validator.errors ?? []) {
        errors.push(formatError(err, `/layout/widgets/${index}/props`));
      }
    }
  });
  return errors;
}

export function validateManifest(payload: unknown): ValidationResult {
  const ok = validate(payload);
  if (!ok) {
    const errors = (validate.errors ?? []).map((e) => formatError(e));
    return { ok: false, errors: errors.length > 0 ? errors : ['unknown validation error'] };
  }

  const data = payload as DashboardManifest;
  const propErrors = validateWidgetProps(data);
  if (propErrors.length > 0) {
    return { ok: false, errors: propErrors };
  }
  return { ok: true, data };
}
