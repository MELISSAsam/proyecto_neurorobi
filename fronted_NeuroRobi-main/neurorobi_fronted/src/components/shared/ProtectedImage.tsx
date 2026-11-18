import { useEffect, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import axios from 'axios';
export function ProtectedImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
    const [image, setImage] = useState<string | undefined>();
    useEffect(() => { if (!src) {
        setImage(undefined);
        return;
    } if (!src.includes('/uploads/')) {
        setImage(src);
        return;
    } let alive = true, url = ''; setImage(undefined); const controller = new AbortController(); const name = src.split('/uploads/')[1]?.split('?')[0]; axios.get(`${import.meta.env.VITE_API_URL}/api/media/${encodeURIComponent(name || '')}`, { responseType: 'blob', signal: controller.signal }).then(({ data }) => { if (alive) {
        url = URL.createObjectURL(data);
        setImage(url);
    } }).catch(() => { }); return () => { alive = false; controller.abort(); if (url)
        URL.revokeObjectURL(url); }; }, [src]);
    return image ? <img {...props} src={image} alt={alt}/> : <span className={props.className} aria-label={alt}/>;
}
