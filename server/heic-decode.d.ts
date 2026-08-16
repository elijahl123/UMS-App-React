declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  interface LazyDecodedImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }

  interface LazyDecodedImages extends Array<LazyDecodedImage> {
    dispose(): void;
  }

  interface Decode {
    (options: { buffer: Buffer | Uint8Array }): Promise<DecodedImage>;
    all(options: { buffer: Buffer | Uint8Array }): Promise<LazyDecodedImages>;
  }

  const decode: Decode;
  export default decode;
}
