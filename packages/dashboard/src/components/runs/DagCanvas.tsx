import { useMemo } from 'react';
import type { FC, MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StepNode } from './StepNode.tsx';
import type { StepNodeData } from './StepNode.tsx';
import dagre from '@dagrejs/dagre';
import type { StepRunDto } from '../../api/runs.ts';

interface DagCanvasProps {
  steps: StepRunDto[];
  onStepClick: (step: StepRunDto) => void;
  selectedStepId: string | undefined;
}

const nodeTypes = {
  step: StepNode,
};

export const DagCanvas: FC<DagCanvasProps> = ({
  steps,
  onStepClick,
  selectedStepId,
}) => {
  const { nodes, edges } = useMemo(() => {
    const initialNodes: Node<StepNodeData>[] = steps.map((step) => ({
      id: step.stepKey,
      type: 'step',
      selected: step.id === selectedStepId,
      data: {
        stepKey: step.stepKey,
        handlerName: step.handlerName,
        status: step.status,
        attemptCount: step.attemptCount,
        maxAttempts: step.maxAttempts,
        startedAt: step.startedAt ?? null,
        completedAt: step.completedAt ?? null,
      },
      position: { x: 0, y: 0 },
    }));

    const initialEdges: Edge[] = [];
    steps.forEach((step) => {
      if (step.dependsOn && step.dependsOn.length > 0) {
        step.dependsOn.forEach((depKey: string) => {
          initialEdges.push({
            id: `${depKey}->${step.stepKey}`,
            source: depKey,
            target: step.stepKey,
          });
        });
      }
    });

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'LR',
      nodesep: 50,
      ranksep: 80,
    });

    initialNodes.forEach((node) => {
      g.setNode(node.id, { width: 210, height: 70 });
    });

    initialEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    const positionedNodes = initialNodes.map((node) => {
      const nodeInfo = g.node(node.id);
      return {
        ...node,
        position: {
          x: nodeInfo.x - 105,
          y: nodeInfo.y - 35,
        },
      };
    });

    const formattedEdges = initialEdges.map((edge) => {
      const sourceStep = steps.find((s) => s.stepKey === edge.source);
      const targetStep = steps.find((s) => s.stepKey === edge.target);
      
      const isTargetRunning = targetStep?.status.toUpperCase() === 'RUNNING';
      const isSourceSucceeded = sourceStep?.status.toUpperCase() === 'SUCCEEDED' || sourceStep?.status.toUpperCase() === 'COMPLETED';
      const isSourceFailed = sourceStep?.status.toUpperCase() === 'FAILED' || sourceStep?.status.toUpperCase() === 'DEAD_LETTERED';

      let strokeColor = 'var(--border-strong)';
      let strokeWidth = 1.5;
      
      if (isTargetRunning) {
        strokeColor = 'var(--state-running-text)';
        strokeWidth = 2.5;
      } else if (isSourceSucceeded) {
        strokeColor = 'var(--state-succeeded-border)';
        strokeWidth = 2;
      } else if (isSourceFailed) {
        strokeColor = 'var(--state-failed-border)';
        strokeWidth = 2;
      }

      return {
        ...edge,
        style: {
          stroke: strokeColor,
          strokeWidth,
          transition: 'stroke 0.3s, stroke-width 0.3s',
        },
        animated: isTargetRunning,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 12,
          height: 12,
        },
      };
    });

    return { nodes: positionedNodes, edges: formattedEdges };
  }, [steps, selectedStepId]);

  const handleNodeClick = (_event: MouseEvent, node: Node) => {
    const step = steps.find((s) => s.stepKey === node.id);
    if (step) {
      onStepClick(step);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] select-none">
      {steps.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">No steps to visualize</span>
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
        >
          <Background color="var(--border-strong)" gap={16} size={1} />
          <Controls
            showInteractive={false}
            className="!rounded-[var(--radius-md)] !border-[var(--border-default)] !bg-[var(--bg-surface)] [&>button]:!border-b-[var(--border-subtle)] [&>button]:!text-[var(--text-secondary)] hover:[&>button]:!bg-[var(--bg-surface-hover)]"
          />
          <MiniMap
            nodeColor={(n) => {
              const step = steps.find((s) => s.stepKey === n.id);
              if (!step) return 'var(--border-default)';
              switch (step.status.toUpperCase()) {
                case 'PENDING': return 'var(--state-pending-bg)';
                case 'QUEUED': return 'var(--state-queued-bg)';
                case 'RUNNING': return 'var(--state-running-bg)';
                case 'SUCCEEDED': return 'var(--state-succeeded-bg)';
                case 'FAILED': return 'var(--state-failed-bg)';
                case 'DEAD_LETTERED': return 'var(--state-dlq-bg)';
                default: return 'var(--bg-surface-raised)';
              }
            }}
            maskColor="var(--bg-base)"
            className="!rounded-[var(--radius-md)] !border-[var(--border-default)] !bg-[var(--bg-surface)]"
            style={{ width: 120, height: 90 }}
          />
        </ReactFlow>
      )}
    </div>
  );
};
