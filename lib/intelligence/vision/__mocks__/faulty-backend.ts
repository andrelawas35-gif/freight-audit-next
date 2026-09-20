/**
 * FaultyVisionBackend — mock vision backend for suite 6 fault injection.
 *
 * Implements the VisionExtractor seam to inject controlled failures:
 *   - 500 errors (triggers retry/backoff)
 *   - Timeouts (triggers AbortController → inspectable failure)
 *   - Slow responses (tests timeout budget)
 *
 * Does NOT extend the real GeminiBackend; it sits at the same interface
 * and is swapped in by the fault-injection test.
 */

export interface VisionRequest {
  imageBase64: string;
  mimeType: string;
  documentType: string;
  prompt: string;
}

export interface VisionResponse {
  fields: Array<{ key: string; value: string; confidence: number }>;
  modelId: string;
  latencyMs: number;
}

export type FaultMode = 'normal' | 'error_500' | 'timeout' | 'slow' | 'malformed';

export interface FaultyVisionConfig {
  mode: FaultMode;
  /** Delay in ms before responding (for slow mode). */
  delayMs?: number;
  /** Error message for error_500 mode. */
  errorMessage?: string;
}

/**
 * A vision backend that injects faults on demand.
 */
export class FaultyVisionBackend {
  private callCount = 0;

  constructor(private config: FaultyVisionConfig) {}

  async extract(request: VisionRequest): Promise<VisionResponse> {
    this.callCount++;

    switch (this.config.mode) {
      case 'error_500':
        throw new Error(
          `[FaultyVisionBackend] Simulated 500 error: ${this.config.errorMessage || 'Internal server error'}`,
        );

      case 'timeout':
        // Never resolve — simulates a hung connection
        return new Promise(() => {
          // intentional no-op — will be aborted by AbortController
        });

      case 'slow': {
        const delay = this.config.delayMs ?? 15_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.normalResponse(request, delay);
      }

      case 'malformed':
        // Return a response that doesn't match the expected schema
        return {
          fields: [],
          modelId: 'faulty-model',
          latencyMs: 10,
        } as any; // malformed payload

      case 'normal':
      default:
        return this.normalResponse(request, 5);
    }
  }

  private normalResponse(request: VisionRequest, latencyMs: number): VisionResponse {
    return {
      fields: [
        { key: 'insured_name', value: 'Test Insured', confidence: 0.95 },
        { key: 'policy_number', value: 'POL-001', confidence: 0.92 },
        { key: 'coverage_amount', value: '50000', confidence: 0.88 },
      ],
      modelId: 'faulty-vision-mock',
      latencyMs,
    };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }

  setMode(mode: FaultMode): void {
    this.config.mode = mode;
  }
}
