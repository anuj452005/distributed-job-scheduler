import { useMemo } from 'react';
import type { FC } from 'react';
import {
  ReactFlow,
  Background,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { StepInput } from '../../api/workflows.ts';

interface DesignNodeData extends Record<string, unknown> {
  stepKey: string;
  handlerName: string;
}

const DesignNode: FC<{ data: DesignNodeData; selected?: boolean }> = ({ data, selected }) => (
  <div
    className="relative flex min-w-[180px] flex-col gap-1.5 rounded-[var(--radius-lg)] border p-3 pl-4 select-none"
    style={{
      backgroundColor: 'var(--accent-primary-subtle)',
      borderColor: selected ? 'var(--accent-primary)' : 'var(--accent-primary-border)',
      boxShadow: selected ? '0 0 0 2px var(--accent-primary)' : undefined,
    }}
  >
    <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
    {/* Left accent strip */}
    <div
      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[var(--radius-lg)]"
      style={{ backgroundColor: 'var(--accent-primary)' }}
    />
    <span className="font-mono text-xs font-bold text-[var(--text-primary)] truncate max-w-[150px]" title={data.stepKey}>
      {data.stepKey}
    </span>
    <span className="font-sans text-[10px] text-[var(--text-secondary)] truncate max-w-[150px]" title={data.handlerName}>
      {data.handlerName}
    </span>
    <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
  </div>
);

const nodeTypes = { designStep: DesignNode };

interface WorkflowDesignCanvasProps {
  steps: StepInput[];
}

export const WorkflowDesignCanvas: FC<WorkflowDesignCanvasProps> = ({ steps }) => {
  const { nodes, edges } = useMemo(() => {
    if (steps.length === 0) return { nodes: [], edges: [] };

    const initialNodes: Node<DesignNodeData>[] = steps.map((step, index) => ({
      id: step.stepKey || `__unnamed_${index}`,
      type: 'designStep',
      data: { stepKey: step.stepKey || '(unnamed)', handlerName: step.handlerName },
      position: { x: 0, y: 0 },
    }));

    const initialEdges: Edge[] = [];
    steps.forEach((step) => {
      if (step.dependsOn && step.dependsOn.length > 0) {
        step.dependsOn.forEach((depKey) => {
          if (depKey && step.stepKey) {
            initialEdges.push({
              id: `${depKey}->${step.stepKey}`,
              source: depKey,
              target: step.stepKey,
              style: { stroke: 'var(--accent-primary-border)', strokeWidth: 1.5 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: 'var(--accent-primary-border)',
                width: 10,
                height: 10,
              },
            });
          }
        });
      }
    });

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 70 });

    initialNodes.forEach((node) => {
      g.setNode(node.id, { width: 190, height: 60 });
    });

    initialEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const positionedNodes = initialNodes.map((node) => {
      const info = g.node(node.id);
      return { ...node, position: { x: info.x - 95, y: info.y - 30 } };
    });

    return { nodes: positionedNodes, edges: initialEdges };
  }, [steps]);

  if (steps.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center">
        <div className="h-10 w-10 rounded-full border border-dashed border-[var(--border-strong)] flex items-center justify-center">
          <span className="text-[var(--text-muted)] text-lg">+</span>
        </div>
        <span className="font-sans text-xs text-[var(--text-muted)]">Add steps to preview the DAG</span>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.4 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={true}
      zoomOnScroll={true}
    >
      <Background color="var(--border-strong)" gap={20} size={1} />
    </ReactFlow>
  );
};
