export async function withNetworkTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 10_000,
  label = "network request",
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new Error(`${label} timed out after ${timeoutMs}ms`);

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
  }
}
