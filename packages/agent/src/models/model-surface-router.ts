import type { ChatRequest } from "../shared/types.ts";

export type RoutedModelMode = "complete" | "stream";

export interface ModelSurfaceRouter {
  selectSurface(
    request: ChatRequest,
    options: {
      mode: RoutedModelMode;
    },
  ): Promise<string> | string;
}

export class StaticModelSurfaceRouter implements ModelSurfaceRouter {
  private readonly completeSurface: string;
  private readonly streamSurface: string;

  constructor(options: {
    complete: string;
    stream: string;
  }) {
    this.completeSurface = options.complete;
    this.streamSurface = options.stream;
  }

  selectSurface(
    _request: ChatRequest,
    options: {
      mode: RoutedModelMode;
    },
  ): string {
    return options.mode === "stream" ? this.streamSurface : this.completeSurface;
  }
}
