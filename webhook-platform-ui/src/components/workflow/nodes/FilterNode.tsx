import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import BaseNode from './BaseNode';

function FilterNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as Record<string, unknown>;
  const hasConditions = d.conditions != null;
  return (
    <BaseNode
      color="#8b5cf6"
      icon="🔀"
      label={String(d.label || t('workflows.nodeTypes.filter.label'))}
      subtitle={hasConditions ? t('workflows.nodeStatus.conditionsSet') : t('workflows.nodeStatus.noConditions')}
      selected={selected}
    />
  );
}

export default memo(FilterNode);
