/**
 * Appareils distants, présentés comme un réglage produit.
 * Les détails opérateur restent disponibles dans le diagnostic avancé.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  LinkIcon,
  PlusIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  WifiOffIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./shadcn/alert-dialog";
import { Alert, AlertDescription } from "./shadcn/alert";
import { Badge } from "./shadcn/badge";
import { Button } from "./shadcn/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./shadcn/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./shadcn/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./shadcn/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "./shadcn/field";
import { Input } from "./shadcn/input";
import { Separator } from "./shadcn/separator";
import { Spinner } from "./shadcn/spinner";

const LS_URL = "atelier-studio.remote-gateway-url";
const LS_ADMIN = "atelier-studio.remote-admin-token";
const CONNECTED_WINDOW_MS = 2 * 60 * 1000;

type DeviceRow = {
  deviceId: string;
  name: string;
  scopes: string[];
  createdAt: number;
  lastSeenAt: number;
  revoked: boolean;
  revokedAt?: number | null;
};

type Props = {
  /** Default gateway base, e.g. http://127.0.0.1:18765 */
  defaultUrl?: string;
};

function relativeLastSeen(unixSeconds: number) {
  if (!unixSeconds) return "Jamais";
  const elapsed = Math.max(0, Date.now() - unixSeconds * 1000);
  if (elapsed < 60_000) return "À l’instant";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(unixSeconds * 1000);
}

function isConnected(device: DeviceRow) {
  return !device.revoked && Date.now() - device.lastSeenAt * 1000 < CONNECTED_WINDOW_MS;
}

export function RemoteDevicesPanel(p: Props) {
  const [url, setUrl] = useState(
    () => localStorage.getItem(LS_URL) || p.defaultUrl || "http://127.0.0.1:18765",
  );
  const [admin, setAdmin] = useState(() => localStorage.getItem(LS_ADMIN) || "");
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingExpires, setPairingExpires] = useState<number | null>(null);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(LS_URL, url);
  }, [url]);
  useEffect(() => {
    if (admin) localStorage.setItem(LS_ADMIN, admin);
  }, [admin]);

  const headers = useCallback((): HeadersInit => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (admin) h["x-atelier-admin-token"] = admin;
    return h;
  }, [admin]);

  const refresh = useCallback(async (quiet = false) => {
    if (!admin) {
      setDevices(null);
      return;
    }
    setError(null);
    if (!quiet) setBusy(true);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/remote/admin/devices`, {
        headers: headers(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        setDevices(null);
        return;
      }
      setDevices(body.devices ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDevices(null);
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [admin, headers, url]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!pairingExpires) return;
    const update = () => {
      const remaining = Math.max(0, pairingExpires - Math.floor(Date.now() / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setPairingCode(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [pairingExpires]);

  const activeDevices = useMemo(
    () => (devices ?? []).filter((device) => !device.revoked).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [devices],
  );

  const startPairing = async () => {
    setPairingOpen(true);
    setPairingCode(null);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/remote/admin/pairing/start`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        setPairingOpen(false);
        return;
      }
      setPairingCode(body.code ?? null);
      setPairingExpires(body.expiresAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPairingOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (deviceId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${url.replace(/\/$/, "")}/remote/admin/devices/${encodeURIComponent(deviceId)}/revoke`,
        { method: "POST", headers: headers() },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body.error || body.code || res.statusText));
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tw:flex tw:min-w-0 tw:flex-col">
      <div className="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:px-1 tw:pb-3">
        <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2.5">
          <ShieldCheckIcon className="tw:text-muted-foreground" aria-hidden="true" />
          <div className="tw:min-w-0">
            <div className="tw:text-[var(--fs-body-s)] tw:font-medium">Connexion sécurisée</div>
            <div className="tw:text-[var(--fs-caption)] tw:text-muted-foreground">
              Atelier relie ce Mac à tes appareils via Tailscale.
            </div>
          </div>
        </div>
        <Button size="sm" disabled={busy || !admin} onClick={() => void startPairing()}>
          {busy ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
          Ajouter
        </Button>
      </div>

      <Separator />

      {error && (
        <Alert variant="destructive" className="tw:mx-1 tw:my-3 tw:w-auto">
          <WifiOffIcon />
          <AlertDescription>
            Connexion impossible. Vérifie le diagnostic avancé ci-dessous.
          </AlertDescription>
        </Alert>
      )}

      {devices === null && admin && !error && (
        <div className="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-5 tw:text-[var(--fs-body-s)] tw:text-muted-foreground">
          <Spinner />
          Recherche des appareils…
        </div>
      )}

      {devices && activeDevices.length === 0 && (
        <Empty className="tw:min-h-32">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SmartphoneIcon /></EmptyMedia>
            <EmptyTitle>Aucun appareil</EmptyTitle>
            <EmptyDescription>Ajoute un iPhone ou un iPad pour accéder à Atelier à distance.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {activeDevices.map((device, index) => {
        const connected = isConnected(device);
        return (
          <div key={device.deviceId}>
            {index > 0 && <Separator />}
            <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-3 tw:px-3 tw:py-3">
              <div className="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[var(--radius-control)] tw:bg-muted tw:text-muted-foreground">
                <SmartphoneIcon aria-hidden="true" />
              </div>
              <div className="tw:min-w-0 tw:flex-1">
                <div className="tw:truncate tw:text-[var(--fs-body-s)] tw:font-medium">{device.name}</div>
                <div className="tw:text-[var(--fs-caption)] tw:text-muted-foreground">
                  {connected ? "Actif maintenant" : `Vu ${relativeLastSeen(device.lastSeenAt).toLocaleLowerCase("fr-CA")}`}
                </div>
              </div>
              <Badge
                variant="ghost"
                className={connected ? "tw:text-[var(--status-success)]" : "tw:text-muted-foreground"}
              >
                <span
                  data-icon="inline-start"
                  className={connected
                    ? "tw:size-1.5 tw:rounded-full tw:bg-[var(--status-success)]"
                    : "tw:size-1.5 tw:rounded-full tw:bg-muted-foreground"}
                />
                {connected ? "Connecté" : "Appairé"}
              </Badge>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Oublier ${device.name}`} />}>
                  <Trash2Icon />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Oublier {device.name} ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cet appareil perdra immédiatement son accès. Un nouvel appairage sera nécessaire.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void revoke(device.deviceId)}>
                      Oublier
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        );
      })}

      <Separator />

      <Collapsible className="tw:px-1 tw:pt-2">
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" className="tw:w-full tw:justify-between tw:text-muted-foreground" />}
        >
          Diagnostic avancé
          <ChevronDownIcon data-icon="inline-end" className="tw:transition-transform tw:in-aria-expanded:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="tw:px-2 tw:pb-2 tw:pt-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="remote-gateway-url">Adresse locale du gateway</FieldLabel>
              <Input
                id="remote-gateway-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                spellCheck={false}
              />
              <FieldDescription>Réservée au diagnostic sur ce Mac.</FieldDescription>
            </Field>
            <Field data-invalid={Boolean(error && !admin)}>
              <FieldLabel htmlFor="remote-admin-token">Jeton administrateur</FieldLabel>
              <Input
                id="remote-admin-token"
                type="password"
                value={admin}
                onChange={(event) => setAdmin(event.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={Boolean(error && !admin)}
              />
              <FieldDescription>Conservé uniquement sur ce Mac.</FieldDescription>
            </Field>
            <Button variant="outline" size="sm" disabled={busy || !admin} onClick={() => void refresh()}>
              {busy ? <Spinner data-icon="inline-start" /> : <CheckCircle2Icon data-icon="inline-start" />}
              Vérifier la connexion
            </Button>
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={pairingOpen} onOpenChange={setPairingOpen}>
        <DialogContent closeLabel="Fermer">
          <DialogHeader>
            <DialogTitle>Ajouter un appareil</DialogTitle>
            <DialogDescription>
              Ouvre Atelier sur l’iPhone, puis saisis ce code d’appairage.
            </DialogDescription>
          </DialogHeader>
          <div className="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-[var(--radius-control)] tw:bg-muted tw:px-4 tw:py-5">
            {pairingCode ? (
              <>
                <div className="tw:font-mono tw:text-2xl tw:font-semibold tw:tracking-[0.16em] tw:text-foreground">
                  {pairingCode}
                </div>
                <Badge variant="secondary">Expire dans {secondsLeft} s</Badge>
              </>
            ) : (
              <Spinner />
            )}
          </div>
          <div className="tw:flex tw:items-center tw:gap-2 tw:text-[var(--fs-caption)] tw:text-muted-foreground">
            <LinkIcon aria-hidden="true" />
            Le jeton permanent sera enregistré automatiquement sur l’appareil.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RemoteDevicesPanel;
