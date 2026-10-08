export type FileSource = {
  name: string;
  path?: string;
  size: number;
  type: string;
  lastModified: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

export type FileMeta = {
  id: string;
  name: string;
  path?: string;
  size: number;
  type: string;
  batch: string;
};

export type OutgoingItem = FileMeta & { source: FileSource };

export type FileSink = {
  write(offset: number, data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
};

export type SinkProvider = {
  open(peerId: string, meta: FileMeta): Promise<{ sink: FileSink; offset: number } | "done">;
  progress(peerId: string, meta: FileMeta, received: number): void;
  complete(peerId: string, meta: FileMeta): Promise<void>;
  discard(peerId: string, meta: FileMeta): Promise<void>;
};

export type ControlMessage =
  | { t: "hello"; name: string }
  | { t: "ping" }
  | { t: "offer"; files: FileMeta[] }
  | { t: "accept"; id: string; from: number }
  | { t: "reject"; id: string; reason: "space" | "error" }
  | { t: "ack"; id: string; upto: number }
  | { t: "end"; id: string }
  | { t: "received"; id: string }
  | { t: "cancel"; id: string }
  | { t: "note"; id: string; text: string }
  | { t: "pair-ask" }
  | { t: "pair-yes" }
  | { t: "pair-no" };

export type TransferStatus =
  | "queued"
  | "waiting"
  | "active"
  | "finishing"
  | "done"
  | "cancelled"
  | "failed";

export type TransferView = {
  key: string;
  id: string;
  peerId: string;
  direction: "out" | "in";
  name: string;
  path?: string;
  size: number;
  type: string;
  batch: string;
  status: TransferStatus;
  bytes: number;
  rate: number;
  error?: "space" | "error" | "source";
};

export type NoteView = {
  id: string;
  peerId: string;
  direction: "out" | "in";
  text: string;
  at: number;
};

export type Route = "lan" | "direct" | "relay";

export type ChannelLike = {
  readyState: string;
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: string;
  send(data: ArrayBuffer | Uint8Array | string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onbufferedamountlow: ((event: unknown) => void) | null;
};

export type PeerEvent =
  | { type: "sent"; meta: FileMeta }
  | { type: "received"; meta: FileMeta }
  | { type: "note"; note: NoteView }
  | { type: "pair-ask" }
  | { type: "pair-yes" }
  | { type: "pair-no" }
  | { type: "key-mismatch" };
