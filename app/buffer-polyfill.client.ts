import { Buffer } from "buffer-polyfill";

globalThis.Buffer = Buffer as unknown as BufferConstructor;
