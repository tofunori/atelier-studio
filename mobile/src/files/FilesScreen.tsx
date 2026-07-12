/**
 * Bounded file browser — same fileId API as gallery, list layout (plan 034 G).
 */
import { GalleryScreen } from "../gallery/GalleryScreen.tsx";
import type { DeviceCredentials } from "../transport/types.ts";

type Props = {
  credentials: DeviceCredentials | null;
  onNeedPair: () => void;
};

export function FilesScreen(p: Props) {
  return (
    <GalleryScreen
      credentials={p.credentials}
      onNeedPair={p.onNeedPair}
      layout="list"
      title="Fichiers"
    />
  );
}
