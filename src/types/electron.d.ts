export interface ElectronPickedMediaFile {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  mimeType?: string;
  attachmentType?: 'document' | 'image' | 'video';
  size?: number;
}

export interface ElectronReadMediaResult {
  ok: boolean;
  bytes?: Uint8Array;
  fileName?: string;
  mimeType?: string;
  attachmentType?: 'document' | 'image' | 'video';
  error?: string;
}

export interface ElectronBridgeAPI {
  isElectron: boolean;
  chromeVersion: string;
  preparePartition: (partition: string) => Promise<{ ok: boolean }>;
  clearPartition: (partition: string) => Promise<{ ok: boolean }>;
  pickMediaFile?: (filterKind?: 'all' | 'video' | 'document') => Promise<ElectronPickedMediaFile>;
  readMediaBytes?: (payload: {
    filePath?: string;
    fileUrl?: string;
    fileName?: string;
    mimeType?: string;
  }) => Promise<ElectronReadMediaResult>;
  openExternal: (url: string) => Promise<void>;
  minimizeWindow?: () => Promise<{ ok: boolean }>;
  toggleMaximizeWindow?: () => Promise<{ maximized: boolean }>;
  closeWindow?: () => Promise<{ ok: boolean }>;
  onOpenNewTab?: (callback: (url: string) => void) => () => void;
}

export interface ElectronWebviewElement extends HTMLElement {
  src: string;
  partition: string;
  useragent?: string;
  allowpopups?: boolean;
  reload: () => void;
  stop: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  loadURL: (url: string) => Promise<void>;
  getURL: () => string;
  getTitle: () => string;
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
  openDevTools: () => void;
  send: (channel: string, ...args: unknown[]) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
  }
}

export {};
