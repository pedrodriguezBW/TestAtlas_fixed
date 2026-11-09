export function apiUrl(path: string, backendUrl: string | undefined = import.meta.env?.VITE_BACKEND_URL): string {
    return backendUrl ? new URL(path, backendUrl).href : path
}