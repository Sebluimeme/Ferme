/** A version belongs to this loaded page, never to shared browser storage. */
const SAFE_AUTO_RELOAD_PATHS = new Set(["/", "/eau", "/chauffage"]);

function knownVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const version = value.trim();
  return version && version !== "local" && version.length <= 200 ? version : null;
}

export interface ReloadContext {
  pathname: string;
  online: boolean;
  visible: boolean;
  dialogOpen: boolean;
  formPresent: boolean;
  fieldActive: boolean;
  hasDraft: boolean;
  busy: boolean;
  interacting: boolean;
}

export class AppVersionTracker {
  private readonly loadedVersion: string | null;
  private availableVersion: string | null = null;
  private reloadRequested = false;

  constructor(loadedVersion: unknown) {
    this.loadedVersion = knownVersion(loadedVersion);
  }

  observe(version: unknown): boolean {
    const known = knownVersion(version);
    if (!known) return false;
    this.availableVersion = known;
    return true;
  }

  hasPendingUpdate(): boolean {
    return !this.reloadRequested && this.loadedVersion !== null
      && this.availableVersion !== null && this.availableVersion !== this.loadedVersion;
  }

  /** A blocked check never changes which bundle is actually loaded. */
  consumeReload(context: ReloadContext): boolean {
    if (!this.hasPendingUpdate() || !SAFE_AUTO_RELOAD_PATHS.has(context.pathname)
      || !context.online || !context.visible || context.dialogOpen || context.formPresent
      || context.fieldActive || context.hasDraft || context.busy || context.interacting) return false;
    this.reloadRequested = true;
    return true;
  }
}
