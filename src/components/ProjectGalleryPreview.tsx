import { useEffect, useRef, useState } from "react";
import { File } from "lucide-react";

const imagePreview = /\.(pdf|png|jpe?g|webp|gif|svg|html?)$/i;
const textPreview = /\.(md|tex)$/i;
export function hasGalleryPreview(path: string) {
  return imagePreview.test(path) || textPreview.test(path);
}

export default function ProjectGalleryPreview({ rel, origin, revision }: {
  rel: string; origin?: string; revision: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const isText = textPreview.test(rel);
  const url = origin && hasGalleryPreview(rel)
    ? `${origin}/${isText ? "snippet" : "thumb"}?path=${encodeURIComponent(rel)}&${isText ? "n=10" : "w=480"}&rev=${revision}`
    : undefined;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "250px" });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setText(""); setFailed(false);
    if (!visible || !isText || !url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Preview unavailable"); return response.text(); })
      .then(value => { if (!controller.signal.aborted) setText(value.slice(0, 600)); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [url, isText, visible]);

  return <div className="project-gallery-preview" ref={element} aria-hidden="true">
    <File size={30}/><span>{rel.split(".").pop()?.toUpperCase()}</span>
    {visible && url && !failed && (isText
      ? text && <pre className="project-gallery-snippet">{text}</pre>
      : <img key={url} data-pdf={/\.pdf$/i.test(rel) || undefined} loading="lazy" decoding="async" alt="" src={url} onError={() => setFailed(true)}/>)}
  </div>;
}
