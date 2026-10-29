const BACKEND_TIMEOUT_MS = 60_000;

export async function forwardFormData(request: Request, path: string) {
  const baseUrl = process.env.BACKEND_URL;
  const apiKey = process.env.BACKEND_API_KEY;
  if (!baseUrl || !apiKey) {
    return Response.json({ detail: "Server is not configured" }, { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ detail: "Invalid form data" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "X-API-Key": apiKey },
      body: formData,
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json({ detail: "Could not reach the backend" }, { status: 502 });
  }
}
