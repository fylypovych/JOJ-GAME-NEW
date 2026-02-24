import type { SyntheticEvent } from 'react';

type HoverImageProps = {
  src: string;
  alt: string;
  className?: string;
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
};

export const HoverImage = ({ src, alt, className = 'admin-thumb', onLoad, onError }: HoverImageProps) => (
  <span className="admin-hover-image">
    <img className={className} src={src} alt={alt} onLoad={onLoad} onError={onError} />
    <span className="admin-hover-popover" aria-hidden="true">
      <img src={src} alt={alt} />
    </span>
  </span>
);
