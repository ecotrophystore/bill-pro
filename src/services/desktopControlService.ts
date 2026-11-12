import toast from 'react-hot-toast';

export interface DesktopAppStatus {
  running: boolean;
  minimized: boolean;
  visible: boolean;
  sandboxed?: boolean;
  vbsPath?: string;
  winRCommand?: string;
}

const TOAST_ID = 'ecobill-desktop-action';

// ─── Status Polling ───────────────────────────────────────────────────────────

export async function getDesktopAppStatus(): Promise<DesktopAppStatus | null> {
  try {
    const res = await fetch('/api/desktop/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── ecobill:// Protocol Launch (primary — zero terminal, zero backend) ───────
//
// The ecobill:// custom URI scheme is registered in Windows registry by
// electron/register-protocol.cjs (run once) or by the backend auto-registration.
// Chrome navigates to `ecobill://open` → Windows directly launches electron.exe.
// No backend, no terminal, no Win+R needed.

export function openViaProtocol(): void {
  // Navigate to custom URI — Chrome passes it to Windows → electron.exe launches
  window.location.href = 'ecobill://open';
}

// ─── Fallback: Win+R clipboard copy ──────────────────────────────────────────

const DEFAULT_WIN_R_CMD =
  'wscript "c:\\Users\\ASUS\\.gemini\\antigravity\\scratch\\bill-pro\\Open-EcoBill-Browser.vbs"';

export async function copyDesktopWinRCommand(customCommand?: string): Promise<boolean> {
  const cmd = customCommand || DEFAULT_WIN_R_CMD;
  try {
    await navigator.clipboard.writeText(cmd);
    toast.success(
      '📋 Copied! Press Win + R, paste (Ctrl+V), and hit Enter to open EcoBill Browser.',
      { id: TOAST_ID, duration: 6000 }
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Desktop Action (minimize / close via backend control port) ───────────────

export async function triggerDesktopAction(action: 'open' | 'minimize' | 'close'): Promise<{
  ok: boolean;
  sandboxed?: boolean;
  notRunning?: boolean;
  winRCommand?: string;
}> {
  // "open" always uses the ecobill:// protocol — fastest, no backend needed
  if (action === 'open') {
    openViaProtocol();
    // Show a friendly toast; the window will appear within ~1 second if Electron is installed
    toast.success('🚀 Launching EcoBill Desktop...', { id: TOAST_ID, duration: 3000 });
    return { ok: true };
  }

  // minimize / close — use backend proxy to Electron's control server on port 45921
  try {
    const res = await fetch(`/api/desktop/${action}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (data.notRunning) {
      toast('EcoBill Desktop is not open yet.', { id: TOAST_ID });
      return { ok: false, notRunning: true };
    }

    if (!res.ok || data.success === false) {
      toast.error(data.error || `Could not ${action} EcoBill Desktop`, { id: TOAST_ID });
      return { ok: false };
    }

    if (action === 'minimize') {
      toast.success('EcoBill Desktop minimized', { id: TOAST_ID });
    } else {
      toast.success('EcoBill Desktop closed', { id: TOAST_ID });
    }
    return { ok: true };
  } catch {
    toast.error(`Could not ${action} EcoBill Desktop — is the backend running?`, { id: TOAST_ID });
    return { ok: false };
  }
}
