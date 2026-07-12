import { useState, type WheelEvent } from "react";

type Props = {
  url: string;
  name: string;
  meta?: string;
};

export function ImageViewer(p: Props) {
  const [scale, setScale] = useState(1);

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    setScale((s) => Math.min(5, Math.max(0.5, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  return (
    <div className="viewer-image" onWheel={onWheel}>
      <div className="viewer-toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setScale((s) => Math.min(5, s * 1.2))}>
          +
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setScale((s) => Math.max(0.5, s / 1.2))}>
          −
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setScale(1)}>
          1:1
        </button>
        {p.meta && <span className="viewer-meta">{p.meta}</span>}
      </div>
      <div className="viewer-image-stage">
        <img
          src={p.url}
          alt={p.name}
          style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
          draggable={false}
        />
      </div>
    </div>
  );
}
