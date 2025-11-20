import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  // Определяем, является ли data FormData или другим типом файлов
  const isFormData = data instanceof FormData;
  const isBlob = data instanceof Blob;
  const isFile = typeof File !== 'undefined' && data instanceof File;
  const isFileUpload = isFormData || isBlob || isFile;

  const res = await fetch(url, {
    method,
    // Не устанавливаем Content-Type для FormData - браузер сам установит с boundary
    headers: (data && !isFileUpload) ? { "Content-Type": "application/json" } : {},
    // Не stringify для FormData - отправляем как есть
    body: isFileUpload ? (data as any) : (data ? JSON.stringify(data) : undefined),
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Handle empty responses (204 No Content, etc.)
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  
  // Parse JSON if content-type is application/json
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  
  // Otherwise return text
  return (await res.text()) as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
