import { useEffect, useMemo, type ComponentProps, type Dispatch, type SetStateAction } from "react";
import Chat from "./Chat";
import { useSubagentEvents } from "../hooks/useSubagentEvents";
import { useThreadEvents } from "../hooks/useThreadEvents";
import type { ThreadEventStore } from "../lib/threadEventStore";
import { resolvePins, type Pin } from "../lib/pins";

const EMPTY_PINS: Pin[] = [];
type Props = Omit<ComponentProps<typeof Chat>, "events" | "pins"> & {
  eventStore: ThreadEventStore;
  threadPins: Pin[] | undefined;
  setPins: Dispatch<SetStateAction<Record<string, Pin[]>>>;
  ws?: WebSocket | null;
};

/** The transcript subscription lives below App, alongside pin reconciliation.
 * A text delta no longer rerenders the workspace shell or another transcript. */
export default function ThreadChat({ eventStore, threadPins, setPins, ws = null, ...props }: Props) {
  const events = useThreadEvents(eventStore, props.threadId);
  const eventsByThreadId = useSubagentEvents({
    store: eventStore,
    ws,
    parentThreadId: props.threadId,
    parentEvents: events,
    parentWorkingSince: props.workingSince,
  });
  const rawPins = threadPins ?? EMPTY_PINS;
  const pins = useMemo(() => resolvePins(events, rawPins), [events, rawPins]);
  useEffect(() => {
    const id = props.threadId;
    if (!id || !pins.length || pins === rawPins) return;
    setPins(current => current[id] === rawPins ? { ...current, [id]: pins } : current);
  }, [props.threadId, pins, rawPins, setPins]);
  return <Chat {...props} events={events} eventsByThreadId={eventsByThreadId} pins={pins} />;
}
