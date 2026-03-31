declare module 'html2canvas' {
  type Html2CanvasOptions = {
    useCORS?: boolean;
    backgroundColor?: string | null;
    scale?: number;
    ignoreElements?: (element: Element) => boolean;
  };

  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions,
  ): Promise<HTMLCanvasElement>;
}
