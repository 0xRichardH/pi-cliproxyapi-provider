export async function withNetworkTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 10_000,
  label = "network request",
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`);

  const onParentAbort = () => {
    controller.abort(parentSignal?.reason ?? new Error(`${label} aborted`));
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason ?? new Error(`${label} aborted`));
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = operation(controller.signal);
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  }
}
