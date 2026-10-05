export const techniqueLabels: Record<string, string> = {
  USERELATIONSHIP: 'USERELATIONSHIP', VAR: 'VAR / RETURN', SELECTEDVALUE: 'SELECTEDVALUE', SWITCH: 'SWITCH', 'time-intelligence': 'Time intelligence', TREATAS: 'TREATAS', RANKX: 'RANKX', TOPN: 'TOPN',
  ISINSCOPE: 'ISINSCOPE', CROSSFILTER: 'CROSSFILTER', 'field-parameter': 'Field parameters', 'dynamic-TY/PY': 'Dynamic TY / PY', 'window-functions': 'Window functions',
  'disconnected-table': 'Disconnected tables', RLS: 'Row-level security', 'dynamic-RLS': 'Dynamic RLS (identity-based)', 'calculation-group': 'Calculation groups', 'incremental-refresh': 'Incremental refresh',
  hierarchies: 'Hierarchies', 'bidirectional-filter': 'Bi-directional filter', 'inactive-relationships': 'Inactive relationships', 'measure-driven-formatting': 'Measure-driven formatting', directlake: 'DirectLake',
  'calculated-tables': 'Calculated tables',
};
export const techniqueLabel = (k: string) => techniqueLabels[k] ?? k;
