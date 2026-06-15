declare module "hls.js/dist/hls.js" {
  class Hls {
    static isSupported(): boolean;

    loadSource(source: string): void;
    attachMedia(media: HTMLMediaElement): void;
    destroy(): void;
  }

  export default Hls;
}
