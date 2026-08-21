import TriggerNode from './TriggerNode';
import FilterNode from './FilterNode';
import TransformNode from './TransformNode';
import HttpNode from './HttpNode';
import SlackNode from './SlackNode';
import DeliveryNode from './DeliveryNode';
import BranchNode from './BranchNode';
import DelayNode from './DelayNode';
import CreateEventNode from './CreateEventNode';

export const nodeTypes = {
  webhookTrigger: TriggerNode,
  filter: FilterNode,
  transform: TransformNode,
  http: HttpNode,
  slack: SlackNode,
  delivery: DeliveryNode,
  branch: BranchNode,
  delay: DelayNode,
  createEvent: CreateEventNode,
};

export interface NodeTemplate {
  type: string;
  /** i18n key under `workflows.nodeTypes.<type>` — resolve via t() at render time, never hardcode English here. */
  icon: string;
  color: string;
  defaultData: Record<string, unknown>;
}

// Note: `defaultData` intentionally omits `label` — each node component falls
// back to t(`workflows.nodeTypes.<type>.label`) when `data.label` is unset, so
// a freshly dropped node renders in the active locale instead of baked-in English.
export const nodeTemplates: NodeTemplate[] = [
  {
    type: 'webhookTrigger',
    icon: '⚡',
    color: '#f59e0b',
    defaultData: { eventTypePattern: '*' },
  },
  {
    type: 'filter',
    icon: '🔀',
    color: '#8b5cf6',
    defaultData: { conditions: null },
  },
  {
    type: 'transform',
    icon: '🔄',
    color: '#06b6d4',
    defaultData: { template: '{}' },
  },
  {
    type: 'http',
    icon: '🌐',
    color: '#10b981',
    defaultData: { url: '', method: 'POST', headers: {}, body: null, timeout: 30 },
  },
  {
    type: 'slack',
    icon: '💬',
    color: '#e11d48',
    defaultData: { webhookUrl: '', message: '', channel: '' },
  },
  {
    type: 'delivery',
    icon: '📦',
    color: '#3b82f6',
    defaultData: { endpointId: '' },
  },
  {
    type: 'branch',
    icon: '🔀',
    color: '#f97316',
    defaultData: { conditions: null },
  },
  {
    type: 'delay',
    icon: '⏱️',
    color: '#eab308',
    defaultData: { delaySeconds: 5 },
  },
  {
    type: 'createEvent',
    icon: '📤',
    color: '#7c3aed',
    defaultData: { projectId: '', eventType: '', payloadTemplate: '' },
  },
];
