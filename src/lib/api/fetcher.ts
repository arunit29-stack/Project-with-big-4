export async function authFetcher<T>(
  url: string,
  token: string | null,
): Promise<T> {
  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = new Error("Request failed") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}
