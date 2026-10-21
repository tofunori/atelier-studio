// Bandeau dans l'app (cf. notify.ts), chargé au premier usage.
export async function showInAppBanner(title: string, body?: string, onOpen?: () => void): Promise<boolean> {
  const { toast } = await import("sonner");
  toast(title, { description: body, action: onOpen ? { label: "Ouvrir", onClick: onOpen } : undefined });
  return true;
}
