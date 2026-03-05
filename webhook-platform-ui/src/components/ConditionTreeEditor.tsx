/**
 * Visual Condition Tree Editor — shared between RulesPage and Workflow NodeConfigPanel.
 *
 * Renders a recursive AND/OR/NOT tree of conditions with dropdown operators,
 * field inputs and value inputs. No raw JSON editing needed.
 */
import { X, PlusCircle, FolderPlus } from 'lucide-react';
import { Input } from './ui/input';
import { Select } from './ui/select';
import type {
  ConditionNode, ConditionGroup, ConditionPredicate,
  PredicateOperator, GroupOperator,
} from '../api/rules.api';

// ─── Constants (exported for reuse) ─────────────────────────────

export const OPERATORS: { value: PredicateOperator; label: string; noValue?: boolean }[] = [
  { value: 'EQ', label: '= equals' },
  { value: 'NEQ', label: '≠ not equals' },
  { value: 'GT', label: '> greater than' },
  { value: 'GTE', label: '≥ greater or equal' },
  { value: 'LT', label: '< less than' },
  { value: 'LTE', label: '≤ less or equal' },
  { value: 'BETWEEN', label: '↔ between' },
  { value: 'CONTAINS', label: '⊃ contains' },
  { value: 'NOT_CONTAINS', label: '⊅ not contains' },
  { value: 'STARTS_WITH', label: 'starts with' },
  { value: 'ENDS_WITH', label: 'ends with' },
  { value: 'IN', label: '∈ in list' },
  { value: 'NOT_IN', label: '∉ not in list' },
  { value: 'REGEX', label: '~ regex' },
  { value: 'EXISTS', label: '∃ exists', noValue: true },
  { value: 'NOT_EXISTS', label: '∄ not exists', noValue: true },
  { value: 'IS_NULL', label: 'is null', noValue: true },
  { value: 'NOT_NULL', label: 'not null', noValue: true },
];

export const NO_VALUE_OPS: PredicateOperator[] = ['EXISTS', 'NOT_EXISTS', 'IS_NULL', 'NOT_NULL'];

// ─── Helpers (exported for reuse) ───────────────────────────────

export function mkGroup(op: GroupOperator = 'AND'): ConditionGroup {
  return { type: 'group', op, children: [] };
}

export function mkPredicate(): ConditionPredicate {
  return { type: 'predicate', field: '', operator: 'EQ', value: '', valueType: 'STRING' };
}

export function countPredicates(node: ConditionNode | null): number {
  if (!node) return 0;
  if (node.type === 'predicate') return 1;
  return node.children.reduce((s, c) => s + countPredicates(c), 0);
}

// ─── Props ──────────────────────────────────────────────────────

interface ConditionTreeEditorProps {
  node: ConditionNode;
  path?: number[];
  onChange: (updated: ConditionNode) => void;
  onRemove: () => void;
  depth?: number;
  /** Compact layout for narrow panels (workflow sidebar) */
  compact?: boolean;
}

// ─── Group Editor ───────────────────────────────────────────────

export default function ConditionTreeEditor({
  node,
  path = [],
  onChange,
  onRemove,
  depth = 0,
  compact = false,
}: ConditionTreeEditorProps) {
  if (node.type === 'predicate') {
    return (
      <PredicateEditor
        node={node}
        onChange={onChange}
        onRemove={onRemove}
        compact={compact}
      />
    );
  }

  const opColors: Record<string, string> = {
    AND: 'border-l-blue-400 bg-blue-500/5',
    OR: 'border-l-amber-400 bg-amber-500/5',
    NOT: 'border-l-red-400 bg-red-500/5',
  };

  const cycleOp = () => {
    const ops: ConditionGroup['op'][] = ['AND', 'OR', 'NOT'];
    const idx = ops.indexOf(node.op);
    const next = ops[(idx + 1) % ops.length];
    onChange({ ...node, op: next });
  };

  const addChild = (child: ConditionNode) => {
    onChange({ ...node, children: [...node.children, child] });
  };

  const updateChild = (i: number, updated: ConditionNode) => {
    onChange({ ...node, children: node.children.map((c, j) => j === i ? updated : c) });
  };

  const removeChild = (i: number) => {
    const newChildren = node.children.filter((_, j) => j !== i);
    if (newChildren.length === 0 && depth > 0) {
      onRemove();
    } else {
      onChange({ ...node, children: newChildren });
    }
  };

  const opBtnColor: Record<string, string> = {
    AND: 'bg-blue-600 hover:bg-blue-700',
    OR: 'bg-amber-600 hover:bg-amber-700',
    NOT: 'bg-red-600 hover:bg-red-700',
  };

  return (
    <div className={`rounded-lg border-l-[3px] pl-3 py-2 space-y-2 ${opColors[node.op] || ''}`}>
      {/* Group header */}
      <div className="flex items-center gap-2">
        <button
          onClick={cycleOp}
          className={`px-2.5 py-0.5 rounded text-[11px] font-bold text-white transition-colors ${opBtnColor[node.op] || 'bg-gray-600'}`}
          title="Click to cycle: AND → OR → NOT"
        >
          {node.op}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {node.op === 'AND' ? 'All must match' : node.op === 'OR' ? 'Any must match' : 'Negate'}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => addChild(mkPredicate())}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Add condition"
        >
          <PlusCircle className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => addChild(mkGroup('AND'))}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Add nested group"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
        {depth > 0 && (
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove group"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Children */}
      {node.children.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic pl-1">Empty group — add a condition</div>
      ) : (
        <div className="space-y-2">
          {node.children.map((child, i) => (
            <ConditionTreeEditor
              key={i}
              node={child}
              path={[...path, i]}
              onChange={(updated) => updateChild(i, updated)}
              onRemove={() => removeChild(i)}
              depth={depth + 1}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Predicate Editor (single condition row) ────────────────────

function PredicateEditor({
  node,
  onChange,
  onRemove,
  compact,
}: {
  node: ConditionPredicate;
  onChange: (updated: ConditionNode) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const needsValue = !NO_VALUE_OPS.includes(node.operator);

  const handleValueChange = (raw: string) => {
    const num = Number(raw);
    if (raw !== '' && !isNaN(num)) {
      onChange({ ...node, value: num, valueType: 'NUMBER' });
    } else if (raw === 'true' || raw === 'false') {
      onChange({ ...node, value: raw === 'true', valueType: 'BOOLEAN' });
    } else {
      onChange({ ...node, value: raw, valueType: 'STRING' });
    }
  };

  // Compact layout: stack vertically for narrow sidebar
  if (compact) {
    return (
      <div className="bg-muted/40 rounded-lg p-2 border space-y-1.5">
        <div className="flex items-center gap-1">
          <Input
            placeholder="data.amount"
            value={node.field}
            onChange={(e) => onChange({ ...node, field: e.target.value })}
            className="font-mono text-xs h-7 flex-1"
          />
          <button
            onClick={onRemove}
            className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className={`grid gap-1.5 ${needsValue ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Select
            value={node.operator}
            onChange={(e) => onChange({ ...node, operator: e.target.value as PredicateOperator })}
            className="h-7 text-xs"
          >
            {OPERATORS.map(op => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </Select>
          {needsValue && (
            <Input
              placeholder="value"
              value={node.value === undefined || node.value === null ? '' : String(node.value)}
              onChange={(e) => handleValueChange(e.target.value)}
              className="text-xs h-7"
            />
          )}
        </div>
      </div>
    );
  }

  // Wide layout: horizontal row
  return (
    <div className="flex items-start gap-2 bg-muted/40 rounded-lg p-2.5 border">
      <div className={`flex-1 grid gap-2 ${needsValue ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Input
          placeholder="payload.data.amount"
          value={node.field}
          onChange={(e) => onChange({ ...node, field: e.target.value })}
          className="font-mono text-xs h-8"
        />
        <Select
          value={node.operator}
          onChange={(e) => onChange({ ...node, operator: e.target.value as PredicateOperator })}
          className="h-8 text-xs"
        >
          {OPERATORS.map(op => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </Select>
        {needsValue && (
          <Input
            placeholder="value"
            value={node.value === undefined || node.value === null ? '' : String(node.value)}
            onChange={(e) => handleValueChange(e.target.value)}
            className="text-xs h-8"
          />
        )}
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
