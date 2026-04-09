import React, { createContext, useContext, ReactNode } from 'react';
import type { UseGalleryDataResult } from '../app/useGalleryData';

const GalleryContext = createContext<UseGalleryDataResult | null>(null);

export const useGallery = () => {
  const ctx = useContext(GalleryContext);
  if (!ctx) throw new Error('useGallery must be used within GalleryProvider');
  return ctx;
};

interface GalleryProviderProps {
  children: ReactNode;
  value: UseGalleryDataResult;
}

export const GalleryProvider: React.FC<GalleryProviderProps> = ({ children, value }) => (
  <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>
);

export { GalleryContext };
export default GalleryProvider;
