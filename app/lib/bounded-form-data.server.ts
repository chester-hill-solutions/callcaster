export class FormBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = "FormBodyError";
  }
}

export async function readBoundedFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await request.body?.cancel().catch(() => {});
    throw new FormBodyError("Request body exceeds the media upload limit", 413);
  }

  let bytes = 0;
  let overflow = false;
  const bounded = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        overflow = true;
        throw new FormBodyError(
          "Request body exceeds the media upload limit",
          413,
        );
      }
      controller.enqueue(chunk);
    },
  });

  try {
    return await new Response(request.body?.pipeThrough(bounded), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    // Native parsers can replace the stream error; retain the overflow status.
    throw new FormBodyError(
      overflow
        ? "Request body exceeds the media upload limit"
        : "Invalid form body",
      overflow ? 413 : 400,
    );
  }
}
