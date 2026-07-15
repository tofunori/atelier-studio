// Barrel public du design system Atelier. Pas de Card/Stack/Box/Text génériques :
// chaque export porte un rôle ou un pattern produit stable. Styles associés :
// src/styles/primitives.css ; valeurs : src/styles/tokens.css.
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { IconButton } from "./IconButton";
export { Tooltip, TooltipProvider, TOOLTIP_DELAY_MS } from "./Tooltip";
export { Menu, MenuItem, MenuSeparator } from "./Menu";
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "./Popover";
export { SegmentedControl, type SegmentedOption } from "./SegmentedControl";
export { SurfaceHeader } from "./SurfaceHeader";
export { EmptyState } from "./EmptyState";
export { InlineNotice, type NoticeTone } from "./InlineNotice";
export { StatusBadge, type BadgeStatus } from "./StatusBadge";
export { InspectorPanel } from "./InspectorPanel";
export { ContextChip } from "./ContextChip";
export { TabList, Tab } from "./Tabs";
export { ActivityDisclosure } from "./ActivityDisclosure";
export { AppOverlays } from "./AppOverlays";
export { showSuccess, showError, showInfo, showUndo } from "./toast";
export { ScrollToBottomButton } from "./ScrollToBottomButton";
