export interface SerialParams {
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
}

export interface Transport {
  open(params: SerialParams): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  /** Resolve with buffered inbound bytes, or empty array after timeoutMs. */
  read(timeoutMs: number): Promise<Uint8Array>;
  readonly isOpen: boolean;
}
