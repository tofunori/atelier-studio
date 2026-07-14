import {
  FileTextIcon,
  ImagesIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";

export type AppTab = "chats" | "gallery" | "files" | "settings";

const items: Array<{
  value: AppTab;
  label: string;
  icon: typeof MessageSquareIcon;
}> = [
  { value: "chats", label: "Chats", icon: MessageSquareIcon },
  { value: "gallery", label: "Gallery", icon: ImagesIcon },
  { value: "files", label: "Fichiers", icon: FileTextIcon },
  { value: "settings", label: "Réglages", icon: SettingsIcon },
];

export function BottomTabBar() {
  return (
    <TabsList
      className="app-tabbar"
      variant="line"
      aria-label="Navigation principale"
    >
      {items.map(({ value, label, icon: Icon }) => (
        <TabsTrigger key={value} value={value} className="app-tabbar-item">
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
