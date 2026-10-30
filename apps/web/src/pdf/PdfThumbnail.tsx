import { makeStyles, tokens } from '@fluentui/react-components';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../session/context';

/** CSS pixels on the thumbnail's longer side; rendered at the device pixel ratio. */
export const THUMBNAIL_SIZE = 96;

const useStyles = makeStyles({
  thumb: {
    display: 'block',
    maxWidth: `${String(THUMBNAIL_SIZE)}px`,
    maxHeight: `${String(THUMBNAIL_SIZE)}px`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
});

export interface PdfThumbnailProps {
  readonly sourceId: string;
  readonly pageIndex: number;
  readonly label: string;
}

/** A page of a source PDF, rendered in the render worker once it scrolls into view. */
export function PdfThumbnail({ sourceId, pageIndex, label }: PdfThumbnailProps) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    // Long documents (a 1200-page standard) render only the pages someone scrolls to.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const side = Math.round(THUMBNAIL_SIZE * Math.min(2, window.devicePixelRatio || 1));
    workspace
      .renderThumbnail(sourceId, pageIndex, side)
      .then((image) => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!live || !element || !context) return;
        element.width = image.width;
        element.height = image.height;
        context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba.buffer), image.width), 0, 0);
        setReady(true);
      })
      .catch(() => {
        // The document was closed (project switched) before the page arrived; nothing to show.
      });
    return () => {
      live = false;
    };
  }, [visible, workspace, sourceId, pageIndex]);

  return (
    <canvas
      ref={canvas}
      className={styles.thumb}
      width={THUMBNAIL_SIZE}
      height={THUMBNAIL_SIZE}
      role="img"
      aria-label={label}
      data-ready={ready}
    />
  );
}
