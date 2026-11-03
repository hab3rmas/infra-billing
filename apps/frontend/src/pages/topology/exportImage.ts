import type { Node } from '@xyflow/react';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

const PADDING = 0.1;
const MAX_SIDE = 4096;

/**
 * Renders the whole graph (not just the visible part) to PNG or SVG and downloads it, following
 * React Flow's "download image" recipe: fit the node bounds into an off-screen-sized viewport.
 * `background` is the canvas colour, read from the page so both themes export correctly.
 */
export async function exportGraphImage(
  nodes: Node[],
  format: 'png' | 'svg',
  fileName: string,
): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.topology-flow .react-flow__viewport');
  if (!viewport || nodes.length === 0) return;

  const bounds = getNodesBounds(nodes);
  const width = Math.min(MAX_SIDE, Math.max(400, Math.ceil(bounds.width * 1.2)));
  const height = Math.min(MAX_SIDE, Math.max(300, Math.ceil(bounds.height * 1.2)));
  const vp = getViewportForBounds(bounds, width, height, 0.2, 2, PADDING);
  const background = getComputedStyle(
    document.querySelector('.topology-flow') as HTMLElement,
  ).getPropertyValue('--xy-background-color');

  const render = format === 'png' ? toPng : toSvg;
  const dataUrl = await render(viewport, {
    backgroundColor: background.trim() || undefined,
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  });

  const a = document.createElement('a');
  a.download = `${fileName}.${format}`;
  a.href = dataUrl;
  a.click();
}
