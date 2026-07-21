import { useEffect, useRef, useState } from "react";
import { X, Check, ZoomIn } from "lucide-react";

type Props = {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

const SIZE = 256; // output square size
const VIEW = 280; // on-screen preview size

export function LogoCropper({ src, onCancel, onConfirm }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minZoom, setMinZoom] = useState(1);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const m = VIEW / Math.min(image.width, image.height);
      setMinZoom(m);
      setZoom(m);
      setOffset({ x: 0, y: 0 });
      setImg(image);
    };
    image.src = src;
  }, [src]);

  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const c = canvasRef.current;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, VIEW, VIEW);
    const w = img.width * zoom;
    const h = img.height * zoom;
    const x = VIEW / 2 - w / 2 + offset.x;
    const y = VIEW / 2 - h / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);
  }, [img, zoom, offset]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = () => {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = SIZE;
    out.height = SIZE;
    const octx = out.getContext("2d")!;
    const scale = SIZE / VIEW;
    const w = img.width * zoom * scale;
    const h = img.height * zoom * scale;
    const x = SIZE / 2 - w / 2 + offset.x * scale;
    const y = SIZE / 2 - h / 2 + offset.y * scale;
    octx.drawImage(img, x, y, w, h);
    onConfirm(out.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Crop logo</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Drag to reposition, use the slider to zoom.</p>
        <div className="flex justify-center">
          <div
            className="relative rounded-full overflow-hidden border border-border bg-white/[0.03] cursor-move touch-none"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={VIEW} height={VIEW} className="block" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ZoomIn className="w-4 h-4 text-muted-foreground" />
          <input
            type="range"
            min={minZoom}
            max={minZoom * 4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:brightness-110"
          >
            <Check className="w-4 h-4" /> Save logo
          </button>
        </div>
      </div>
    </div>
  );
}