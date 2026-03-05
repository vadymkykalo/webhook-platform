import { memo, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

interface BaseNodeProps {
  color: string;
  icon: string;
  label: string;
  subtitle?: string;
  selected?: boolean;
  hasInput?: boolean;
  hasOutput?: boolean;
  children?: ReactNode;
}

function BaseNodeComponent({ color, icon, label, subtitle, selected, hasInput = true, hasOutput = true, children }: BaseNodeProps) {
  return (
    <div
      className={`
        rounded-xl border-2 bg-card shadow-md min-w-[180px] max-w-[240px] transition-all
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
      `}
      style={{ borderColor: color }}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !border-background"
          style={{ background: color }}
        />
      )}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: `1px solid ${color}20` }}>
        <span className="text-base flex-shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate">{label}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="px-3 py-2 text-[10px] text-muted-foreground">{children}</div>}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !border-background"
          style={{ background: color }}
        />
      )}
    </div>
  );
}

export default memo(BaseNodeComponent);
