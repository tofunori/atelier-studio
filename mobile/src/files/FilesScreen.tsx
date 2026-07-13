/**
 * Bounded file browser — same fileId API as gallery, list layout (plan 034 G).
 */
import { GalleryScreen } from "../gallery/GalleryScreen.tsx";
import type { DeviceCredentials } from "../transport/types.ts";

type Props = {
  credentials: DeviceCredentials | null;
  onNeedPair: () => void;
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
};

export function FilesScreen(p: Props) {
  return (
    <GalleryScreen
      credentials={p.credentials}
      onNeedPair={p.onNeedPair}
      selectedProjectId={p.selectedProjectId}
      onProjectChange={p.onProjectChange}
      layout="list"
      title="Fichiers"
    />
  );
}
