import { memo } from 'react';
import { type NodeProps, Handle, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

function BranchNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as Record<string, unknown>;
  const hasConditions = d.conditions != null;

  return (
    <div
      className={`relative rounded-xl border-2 bg-card shadow-md px-4 py-3 min-w-[180px] transition-all ${
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border'
      }`}
      style={{ borderColor: selected ? undefined : '#f97316' }}
    >
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-primary" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">🔀</span>
        <span className="text-xs font-semibold truncate">{String(d.label || t('workflows.nodeTypes.branch.label'))}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {hasConditions ? t('workflows.nodeStatus.conditionsSet') : t('workflows.nodeStatus.noConditions')}
      </div>

      {/* Two output handles: true (right-bottom) and false (left-bottom) */}
      <div className="flex justify-between mt-2 text-[9px] text-muted-foreground">
        <span className="text-green-600">✓ {t('workflows.nodeConfig.branchTrue')}</span>
        <span className="text-red-500">✗ {t('workflows.nodeConfig.branchFalse')}</span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!w-3 !h-3 !bg-green-500"
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!w-3 !h-3 !bg-red-500"
        style={{ left: '70%' }}
      />
    </div>
  );
}

export default memo(BranchNode);
