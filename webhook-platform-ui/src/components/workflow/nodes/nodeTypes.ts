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
  label: string;
  icon: string;
  color: string;
  description: string;
  defaultData: Record<string, unknown>;
}

export const nodeTemplates: NodeTemplate[] = [
  {
    type: 'webhookTrigger',
    label: 'Webhook Trigger',
    icon: '⚡',
    color: '#f59e0b',
    description: 'Trigger on incoming webhook event',
    defaultData: { label: 'Webhook Trigger', eventTypePattern: '*' },
  },
  {
    type: 'filter',
    label: 'Filter',
    icon: '🔀',
    color: '#8b5cf6',
    description: 'Filter events by conditions',
    defaultData: { label: 'Filter', conditions: null },
  },
  {
    type: 'transform',
    label: 'Transform',
    icon: '🔄',
    color: '#06b6d4',
    description: 'Transform JSON payload',
    defaultData: { label: 'Transform', template: '{}' },
  },
  {
    type: 'http',
    label: 'HTTP Request',
    icon: '🌐',
    color: '#10b981',
    description: 'Make an outbound HTTP request',
    defaultData: { label: 'HTTP Request', url: '', method: 'POST', headers: {}, body: null, timeout: 30 },
  },
  {
    type: 'slack',
    label: 'Slack',
    icon: '💬',
    color: '#e11d48',
    description: 'Send a Slack message',
    defaultData: { label: 'Slack', webhookUrl: '', message: '', channel: '' },
  },
  {
    type: 'delivery',
    label: 'Deliver to Endpoint',
    icon: '📦',
    color: '#3b82f6',
    description: 'Deliver via platform endpoint',
    defaultData: { label: 'Deliver to Endpoint', endpointId: '' },
  },
  {
    type: 'branch',
    label: 'Branch',
    icon: '🔀',
    color: '#f97316',
    description: 'IF/ELSE conditional branching',
    defaultData: { label: 'Branch', conditions: null },
  },
  {
    type: 'delay',
    label: 'Delay',
    icon: '⏱️',
    color: '#eab308',
    description: 'Pause execution',
    defaultData: { label: 'Delay', delaySeconds: 5 },
  },
  {
    type: 'createEvent',
    label: 'Create Event',
    icon: '📤',
    color: '#7c3aed',
    description: 'Emit event into platform pipeline',
    defaultData: { label: 'Create Event', projectId: '', eventType: '', payloadTemplate: '' },
  },
];
