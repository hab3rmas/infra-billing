import { createContext, use } from 'react';

// Canvas-wide callbacks for node components. React Flow node data must stay serializable-ish, so
// actions travel through context instead of the node's `data`.
export interface TopologyActions {
  openNode: (uuid: string) => void;
  hideNode: (uuid: string) => void;
  /** false on mobile: view only. */
  editable: boolean;
}

export const TopologyActionsContext = createContext<TopologyActions | null>(null);

export function useTopologyActions(): TopologyActions {
  const ctx = use(TopologyActionsContext);
  if (!ctx) throw new Error('useTopologyActions must be used inside the topology canvas');
  return ctx;
}
