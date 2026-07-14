import { useEffect, useRef, useState } from "react";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { cn } from "@/lib/utils.ts";

type Props = {
  label?: string;
  className?: string;
};

export function WorkingStatus({ label = "Travaille", className }: Props = {}) {
  const startedAt = useRef(Date.now());
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = () => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Marker role="status" aria-live="polite" className={cn("working-status", className)}>
      <MarkerIcon><Spinner /></MarkerIcon>
      <MarkerContent>
        <span>{label}</span>
        <span className="working-status-time">· {seconds} s</span>
      </MarkerContent>
    </Marker>
  );
}
