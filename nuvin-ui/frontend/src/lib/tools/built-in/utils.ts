export const isAbsolutePath = (p: string) =>
        p.startsWith('/') ||
        /^\\\\/.test(p) ||
        /^\\/.test(p) ||
        /^[a-zA-Z]:[\\/]/.test(p);