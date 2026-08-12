export type ProjectNews = {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  summary: string;
  summaryEn: string;
  body: string;
  bodyEn: string;
  coverImagePath: string;
  status: 'draft' | 'published';
  pinned: boolean;
  publishedAt: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type DownloadMaterial = {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  category: string;
  version: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  coverImagePath: string;
  published: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type DownloadMaterialsDocument = {
  kind: 'joj-download-materials';
  version: 1;
  materials: DownloadMaterial[];
};
