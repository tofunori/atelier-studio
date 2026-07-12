import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  smallTranscript,
  mediumTranscript,
  interactionPendingTranscript,
  errorTranscript,
  interruptTranscript,
} from "../src/transcripts/build.ts";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(dir, { recursive: true });

for (const b of [
  smallTranscript(),
  mediumTranscript(),
  interactionPendingTranscript(),
  errorTranscript(),
  interruptTranscript(),
]) {
  const file = join(dir, `${b.id}-transcript.json`);
  writeFileSync(file, `${JSON.stringify(b, null, 2)}\n`);
  console.log("wrote", file, "events=", b.events.length, "lastSequence=", b.lastSequence);
}
