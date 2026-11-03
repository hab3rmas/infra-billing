import type { TopologyGraph } from '@infra/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import {
  graphKey,
  useDeleteLink,
  useDeleteNode,
  useSavePositions,
  useUpdateNode,
} from '@/api/topology';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/lib/theme';
import { notifyError } from '@/utils/notify';
import { TopologyActionsContext } from './context';
import { exportGraphImage } from './exportImage';
import { TrafficEdge } from './edges/TrafficEdge';
import { type MapFilter, type TopoEdgeData, type TopoNodeData, buildFlow, chainOf } from './graph';
import { type Positions, layoutNodes, nodesNeedingLayout } from './layout';
import { ExternalNode } from './nodes/ExternalNode';
import { GroupNode } from './nodes/GroupNode';
import { ServerNode } from './nodes/ServerNode';
import type { LinkDialogState } from './panels/LinkDialog';
import { Legend } from './panels/Legend';
import { ProjectSummary } from './panels/ProjectSummary';
import './topology.css';

const NODE_TYPES = { server: ServerNode, external: ExternalNode, group: GroupNode };
const EDGE_TYPES = { traffic: TrafficEdge };
const SAVE_DEBOUNCE_MS = 600;

export interface CanvasControl {
  /** Re-run the automatic layout for every node (manual positions included). */
  autoLayout: () => Promise<void>;
  fitView: () => void;
  /** Centre the view on one node (node search). */
  focusNode: (uuid: string) => void;
  exportImage: (format: 'png' | 'svg') => Promise<void>;
  /** Keep a chain (a route) highlighted until the pane is clicked; null clears it. */
  pinChain: (chain: { nodes: Set<string>; edges: Set<string> } | null) => void;
}

interface Props {
  graph: TopologyGraph;
  showService: boolean;
  filter: MapFilter;
  controlRef: RefObject<CanvasControl | null>;
  onOpenNode: (uuid: string) => void;
  onLink: (state: LinkDialogState) => void;
  /** Opens the "unlinked servers" review from the project card. */
  onReview: () => void;
}

export function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({ graph, showService, filter, controlRef, onOpenNode, onLink, onReview }: Props) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const rf = useReactFlow();
  const savePositions = useSavePositions();
  const updateNode = useUpdateNode(graph.map.uuid);
  const deleteNode = useDeleteNode(graph.map.uuid);
  const deleteLink = useDeleteLink(graph.map.uuid);
  const { settings } = graph;
  const editable = !isMobile;

  const [auto, setAuto] = useState<Positions>(new Map());
  const [hover, setHover] = useState<string | null>(null);
  // Picked through search: highlighted like a hover until the pane is clicked.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ nodes: Set<string>; edges: Set<string> } | null>(null);
  const [nodes, setNodes] = useState<Node<TopoNodeData>[]>([]);

  // Nodes without saved coordinates get an elk layout once; it is saved so it stays put afterwards.
  const layoutKey = nodesNeedingLayout(graph.nodes)
    .map((n) => n.uuid)
    .join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only when the set of unplaced nodes changes
  useEffect(() => {
    const targets = nodesNeedingLayout(graph.nodes);
    if (targets.length === 0) return;
    let cancelled = false;
    layoutNodes(graph.nodes, graph.links, settings.layoutDirection, targets)
      .then((pos) => {
        if (cancelled || pos.size === 0) return;
        setAuto(pos);
        persist([...pos].map(([uuid, p]) => ({ uuid, x: p.x, y: p.y })));
        // Refit once the new nodes have moved off the origin.
        setTimeout(() => rf.fitView({ duration: 200 }), 80);
      })
      .catch((e) => notifyError(apiErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [layoutKey, settings.layoutDirection]);

  // Hover highlight: the whole chain through a node, everything else dimmed.
  const focus = hover ?? selectedId;
  const chain = useMemo(
    () => pinned ?? (focus ? chainOf(focus, graph.links) : null),
    [pinned, focus, graph.links],
  );

  const base = useMemo(
    () =>
      buildFlow(graph, {
        showExternal: settings.showExternal,
        showService,
        filter,
        animateEdges: settings.animateEdges,
        vertical: settings.layoutDirection === 'DOWN',
        autoPositions: auto,
        highlight: null,
        highlightEdges: null,
      }),
    [graph, settings, showService, filter, auto],
  );

  // Local node state so dragging is smooth; rebuilt whenever the server graph changes.
  useEffect(() => setNodes(base.nodes), [base.nodes]);

  const displayNodes = useMemo(
    () =>
      chain
        ? nodes.map((n) => {
            const on = chain.nodes.has(n.id);
            return { ...n, data: { ...n.data, dimmed: !on, highlighted: on } };
          })
        : nodes,
    [nodes, chain],
  );
  const displayEdges: Edge<TopoEdgeData>[] = useMemo(
    () =>
      chain
        ? base.edges.map((e) => {
            const on = chain.edges.has(e.id);
            return { ...e, data: { ...e.data!, dimmed: !on, highlighted: on } };
          })
        : base.edges,
    [base.edges, chain],
  );

  // ---- saving positions (optimistic cache update, debounced bulk PATCH) --------------------
  const pending = useRef(new Map<string, { uuid: string; x: number; y: number }>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    const batch = [...pending.current.values()];
    pending.current.clear();
    if (batch.length > 0) {
      savePositions.mutate(batch, { onError: (e) => notifyError(apiErrorMessage(e)) });
    }
  }, [savePositions]);

  const persist = useCallback(
    (positions: { uuid: string; x: number; y: number }[]) => {
      qc.setQueryData<TopologyGraph>(graphKey(graph.map.uuid), (old) =>
        old
          ? {
              ...old,
              nodes: old.nodes.map((n) => {
                const p = positions.find((x) => x.uuid === n.uuid);
                return p ? { ...n, posX: p.x, posY: p.y } : n;
              }),
            }
          : old,
      );
      for (const p of positions) pending.current.set(p.uuid, p);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [qc, graph.map.uuid, flush],
  );

  // Send what is still queued when leaving the page.
  useEffect(() => () => flush(), [flush]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<TopoNodeData>>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) =>
      persist(dragged.map((n) => ({ uuid: n.id, x: n.position.x, y: n.position.y }))),
    [persist],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) {
        onLink({ mode: 'create', fromUuid: c.source, toUuid: c.target });
      }
    },
    [onLink],
  );

  useImperativeHandle(
    controlRef,
    () => ({
      autoLayout: async () => {
        const all = graph.nodes.filter((n) => !n.hidden && !n.parentUuid);
        const pos = await layoutNodes(graph.nodes, graph.links, settings.layoutDirection, all);
        setAuto(pos);
        persist([...pos].map(([uuid, p]) => ({ uuid, x: p.x, y: p.y })));
        // The nodes keep their old coordinates in the cache until persist() lands, then refit.
        setTimeout(() => rf.fitView({ duration: 300 }), 50);
      },
      fitView: () => rf.fitView({ duration: 300 }),
      pinChain: (c) => {
        setPinned(c);
        if (c)
          rf.fitView({ nodes: [...c.nodes].map((id) => ({ id })), duration: 400, padding: 0.3 });
      },
      focusNode: (uuid) => {
        rf.fitView({ nodes: [{ id: uuid }], duration: 400, maxZoom: 1.2, padding: 1.5 });
        setSelectedId(uuid);
      },
      exportImage: (format) =>
        exportGraphImage(rf.getNodes(), format, `topology-${graph.map.name}`.replace(/\s+/g, '-')),
    }),
    [graph, settings.layoutDirection, persist, rf],
  );

  // First paint of a map and after elk placed new nodes.
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (nodes.length === 0 || fitted.current === graph.map.uuid) return;
    fitted.current = graph.map.uuid;
    setTimeout(() => rf.fitView(), 30);
  }, [nodes.length, graph.map.uuid, rf]);

  const actions = useMemo(
    () => ({
      openNode: onOpenNode,
      hideNode: (uuid: string) =>
        updateNode.mutate(
          { uuid, dto: { hidden: true } },
          { onError: (e) => notifyError(apiErrorMessage(e)) },
        ),
      editable,
      tabby: settings.tabbyEnabled
        ? { defaultSshUser: settings.defaultSshUser, defaultSshPort: settings.defaultSshPort }
        : null,
    }),
    [onOpenNode, updateNode, editable, settings],
  );

  return (
    <TopologyActionsContext value={actions}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        colorMode={resolved}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_, n) => onOpenNode(n.id)}
        onEdgeClick={(_, e) => {
          const link = graph.links.find((l) => l.uuid === e.id);
          if (link && editable) onLink({ mode: 'edit', link });
        }}
        onNodeMouseEnter={(_, n) => setHover(n.id)}
        onNodeMouseLeave={() => setHover(null)}
        onPaneClick={() => {
          setSelectedId(null);
          setPinned(null);
        }}
        // Delete / Backspace asks first, performs the delete itself and keeps the canvas in sync
        // through the refetch (hence `false`).
        onBeforeDelete={async ({ nodes: ns, edges: es }) => {
          if (!editable) return false;
          if (!window.confirm(t('topology.confirmDeleteSelection'))) return false;
          for (const e of es)
            await deleteLink.mutateAsync(e.id).catch((x) => notifyError(apiErrorMessage(x)));
          for (const n of ns)
            await deleteNode.mutateAsync(n.id).catch((x) => notifyError(apiErrorMessage(x)));
          return false;
        }}
        snapToGrid
        snapGrid={[10, 10]}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        className="topology-flow"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable ariaLabel={t('topology.minimap')} />
        <Panel position="top-left" className="!m-3">
          <ProjectSummary graph={graph} onReview={onReview} editable={editable} />
        </Panel>
        <Panel position="bottom-left" className="!mb-24 !ml-3 md:!mb-3">
          <Legend preset={graph.map.preset} />
        </Panel>
      </ReactFlow>
    </TopologyActionsContext>
  );
}
