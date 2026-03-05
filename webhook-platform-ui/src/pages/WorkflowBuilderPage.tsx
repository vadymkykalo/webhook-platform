import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, ToggleLeft, ToggleRight, Loader2, Play, History, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { WorkflowExecutionResponse } from '../api/workflows.api';
import { workflowsApi } from '../api/workflows.api';
import { Button } from '../components/ui/button';
import { showApiError, showSuccess } from '../lib/toast';
import { nodeTypes, nodeTemplates, type NodeTemplate } from '../components/workflow/nodes/nodeTypes';
import NodeConfigPanel from '../components/workflow/NodeConfigPanel';

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

function WorkflowBuilderInner() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [triggerPayload, setTriggerPayload] = useState('{"type":"test.event","data":{}}');
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);

  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', projectId, workflowId],
    queryFn: () => workflowsApi.get(projectId!, workflowId!),
    enabled: !!projectId && !!workflowId,
  });

  // Load definition into canvas
  useEffect(() => {
    if (workflow?.definition) {
      const def = workflow.definition;
      if (def.nodes && Array.isArray(def.nodes)) {
        setNodes(def.nodes as Node[]);
      }
      if (def.edges && Array.isArray(def.edges)) {
        setEdges(def.edges as Edge[]);
      }
      setHasUnsaved(false);
    }
  }, [workflow, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge(params, eds));
      setHasUnsaved(true);
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      setHasUnsaved(true);
    },
    [onNodesChange],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      setHasUnsaved(true);
    },
    [onEdgesChange],
  );

  // Update node data from config panel
  const handleNodeDataUpdate = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n): Node => (n.id === nodeId ? { ...n, data: newData } : n)),
      );
      setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, data: newData } as Node : prev));
      setHasUnsaved(true);
    },
    [setNodes],
  );

  // Drag & drop from sidebar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const templateJson = event.dataTransfer.getData('application/workflow-node');
      if (!templateJson) return;

      const template: NodeTemplate = JSON.parse(templateJson);
      const wrapperBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!wrapperBounds) return;

      const position = {
        x: event.clientX - wrapperBounds.left - 90,
        y: event.clientY - wrapperBounds.top - 20,
      };

      const newNode: Node = {
        id: getNextNodeId(),
        type: template.type,
        position,
        data: { ...template.defaultData },
      };

      setNodes((nds: Node[]) => [...nds, newNode]);
      setHasUnsaved(true);
    },
    [setNodes],
  );

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds: Node[]) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds: Edge[]) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    setHasUnsaved(true);
  }, [selectedNode, setNodes, setEdges]);

  // Save
  const saveMutation = useMutation({
    mutationFn: () =>
      workflowsApi.update(projectId!, workflowId!, {
        name: workflow!.name,
        description: workflow!.description || undefined,
        definition: { nodes: nodes as unknown as import('../api/workflows.api').WorkflowNode[], edges: edges as unknown as import('../api/workflows.api').WorkflowEdge[] },
        triggerType: workflow!.triggerType,
        triggerConfig: extractTriggerConfig(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', projectId, workflowId] });
      qc.invalidateQueries({ queryKey: ['workflows', projectId] });
      setHasUnsaved(false);
      showSuccess(t('workflows.toast.saved'));
    },
    onError: (err) => showApiError(err, t('workflows.toast.saveFailed')),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => workflowsApi.toggle(projectId!, workflowId!, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow', projectId, workflowId] });
      qc.invalidateQueries({ queryKey: ['workflows', projectId] });
    },
    onError: (err) => showApiError(err, t('workflows.toast.toggleFailed2')),
  });

  const triggerMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => workflowsApi.trigger(projectId!, workflowId!, payload),
    onSuccess: () => {
      showSuccess(t('workflows.toast.triggered'));
      setShowTriggerDialog(false);
      qc.invalidateQueries({ queryKey: ['workflow-executions', projectId, workflowId] });
      setShowHistory(true);
    },
    onError: (err) => showApiError(err, t('workflows.toast.triggerFailed')),
  });

  const { data: executions } = useQuery({
    queryKey: ['workflow-executions', projectId, workflowId],
    queryFn: () => workflowsApi.listExecutions(projectId!, workflowId!, 0, 10),
    enabled: !!projectId && !!workflowId && showHistory,
    refetchInterval: showHistory ? 5000 : false,
  });

  // Extract trigger config from the trigger node
  const extractTriggerConfig = useCallback((): Record<string, unknown> => {
    const triggerNode = nodes.find((n) => n.type === 'webhookTrigger');
    if (triggerNode?.data) {
      const d = triggerNode.data as Record<string, unknown>;
      return { eventTypePattern: d.eventTypePattern || '*' };
    }
    return {};
  }, [nodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsaved && workflow) saveMutation.mutate();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNode && document.activeElement === document.body) {
          deleteSelectedNode();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasUnsaved, workflow, saveMutation, selectedNode, deleteSelectedNode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!workflow) {
    return <div className="p-6 text-center text-muted-foreground">{t('workflows.builder.notFound')}</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/admin/projects/${projectId}/workflows`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm truncate">{workflow.name}</h2>
            <p className="text-[10px] text-muted-foreground">
              v{workflow.version} · {t('workflows.builder.nodesCount', { count: nodes.length })} · {t('workflows.builder.edgesCount', { count: edges.length })}
              {hasUnsaved && <span className="text-amber-500 ml-1">● {t('workflows.builder.unsaved')}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
            {t('workflows.builder.history')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowTriggerDialog(true)}
          >
            <Play className="h-4 w-4" />
            {t('workflows.builder.testRun')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => toggleMutation.mutate(!workflow.enabled)}
          >
            {workflow.enabled ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
            {workflow.enabled ? t('workflows.builder.enabled') : t('workflows.builder.disabled')}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => saveMutation.mutate()}
            disabled={!hasUnsaved || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('workflows.builder.save')}
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node palette sidebar */}
        <div className="w-48 border-r bg-card/50 overflow-y-auto p-3 space-y-2 flex-shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-1">
            {t('workflows.builder.dragToAdd')}
          </p>
          {nodeTemplates.map((template) => (
            <div
              key={template.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/workflow-node', JSON.stringify(template));
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-card cursor-grab hover:shadow-sm hover:border-primary/30 transition-all active:cursor-grabbing"
            >
              <span className="text-sm">{template.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{t(`workflows.nodeTypes.${template.type}.label`)}</div>
                <div className="text-[9px] text-muted-foreground truncate">{t(`workflows.nodeTypes.${template.type}.description`)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={null}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }}
            proOptions={{ hideAttribution: true }}
          >
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              className="!bg-card !border !rounded-lg"
              maskColor="rgba(0,0,0,0.1)"
              nodeStrokeWidth={3}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-muted/20" />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeDataUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Execution history drawer */}
      {showHistory && (
        <div className="border-t bg-card max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b sticky top-0 bg-card z-10">
            <h3 className="text-xs font-semibold">{t('workflows.builder.executionHistory')}</h3>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowHistory(false)}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          {!executions?.content?.length ? (
            <p className="text-xs text-muted-foreground p-4 text-center">{t('workflows.builder.noExecutions')}</p>
          ) : (
            <div className="divide-y">
              {executions.content.map((exec: WorkflowExecutionResponse) => (
                <ExecutionRow key={exec.id} exec={exec} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual trigger dialog */}
      {showTriggerDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowTriggerDialog(false)}>
          <div className="bg-card border rounded-xl p-5 w-[480px] max-w-[90vw] shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{t('workflows.builder.testRun')}</h3>
            <p className="text-xs text-muted-foreground">{t('workflows.builder.testRunHint')}</p>
            <textarea
              value={triggerPayload}
              onChange={(e) => setTriggerPayload(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border rounded-lg bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowTriggerDialog(false)}>
                {t('workflows.cancel')}
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={triggerMutation.isPending}
                onClick={() => {
                  try {
                    const payload = JSON.parse(triggerPayload);
                    triggerMutation.mutate(payload);
                  } catch {
                    showApiError(new Error('Invalid JSON'), t('workflows.toast.triggerFailed'));
                  }
                }}
              >
                {triggerMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {t('workflows.builder.runNow')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionRow({ exec }: { exec: WorkflowExecutionResponse }) {
  const [expanded, setExpanded] = useState(false);
  const statusIcon = exec.status === 'COMPLETED' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    : exec.status === 'FAILED' ? <XCircle className="h-3.5 w-3.5 text-red-500" />
    : exec.status === 'RUNNING' ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
    : <Clock className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-muted/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {statusIcon}
        <span className="font-medium">{exec.status}</span>
        <span className="text-muted-foreground">{exec.startedAt ? new Date(exec.startedAt).toLocaleString() : ''}</span>
        {exec.durationMs != null && <span className="text-muted-foreground">{exec.durationMs}ms</span>}
        {exec.errorMessage && <span className="text-red-500 truncate flex-1">{exec.errorMessage}</span>}
        {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
      </div>
      {expanded && exec.steps && (
        <div className="px-6 pb-2 space-y-1">
          {exec.steps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${
                step.status === 'SUCCESS' ? 'bg-green-500'
                : step.status === 'FAILED' ? 'bg-red-500'
                : step.status === 'SKIPPED' ? 'bg-gray-400'
                : 'bg-blue-500'
              }`} />
              <span className="font-mono">{step.nodeType}</span>
              <span className="text-muted-foreground">{step.nodeId}</span>
              <span className="text-muted-foreground">{step.status}</span>
              {step.durationMs != null && <span className="text-muted-foreground">{step.durationMs}ms</span>}
              {step.errorMessage && <span className="text-red-500 truncate">{step.errorMessage}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner />
    </ReactFlowProvider>
  );
}
