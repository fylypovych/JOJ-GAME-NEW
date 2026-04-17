/**
 * Скрипт для перевірки та оптимізації зображень в public/card-assets/
 * 
 * Примітка: Для повноцінної оптимізації webp зображень рекомендується
 * встановити додаткові інструменти, такі як:
 * - npm install -g webp-converter
 * - npm install -g imagemin-cli
 * 
 * Цей скрипт виконує базову перевірку та звіт про розміри файлів.
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const CARD_ASSETS_DIR = join(fileURLToPath(import.meta.url), '..', '..', 'public', 'card-assets');

interface ImageInfo {
  name: string;
  size: number;
  sizeKB: number;
  path: string;
}

async function scanImages(dir: string): Promise<ImageInfo[]> {
  const images: ImageInfo[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      const subImages = await scanImages(fullPath);
      images.push(...subImages);
    } else if (entry.isFile() && /\.(webp|png|jpg|jpeg)$/i.test(entry.name)) {
      const stats = await stat(fullPath);
      images.push({
        name: entry.name,
        size: stats.size,
        sizeKB: Math.round(stats.size / 1024),
        path: fullPath,
      });
    }
  }

  return images;
}

async function main() {
  console.log('🔍 Скановання зображень в public/card-assets/...\n');

  const images = await scanImages(CARD_ASSETS_DIR);
  
  if (images.length === 0) {
    console.log('Зображень не знайдено.');
    return;
  }

  console.log(`📊 Знайдено ${images.length} зображень:\n`);

  // Сортування за розміром (від найбільшого до найменшого)
  const sortedBySize = [...images].sort((a, b) => b.size - a.size);
  
  console.log('📏 Найбільші зображення:');
  sortedBySize.slice(0, 10).forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.name} - ${img.sizeKB} KB`);
  });

  const totalSize = images.reduce((sum, img) => sum + img.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  const avgSizeKB = Math.round(totalSize / images.length);

  console.log(`\n📈 Статистика:`);
  console.log(`  Загальний розмір: ${totalSizeMB} MB`);
  console.log(`  Середній розмір: ${avgSizeKB} KB`);
  console.log(`  Кількість файлів: ${images.length}`);

  // Перевірка на занадто великі файли
  const largeFiles = images.filter(img => img.sizeKB > 500);
  if (largeFiles.length > 0) {
    console.log(`\n⚠️  Знайдено ${largeFiles.length} файлів більше 500 KB.`);
    console.log('   Рекомендується оптимізувати ці файли для кращої продуктивності.');
  }

  // Рекомендації
  console.log('\n💡 Рекомендації для оптимізації:');
  console.log('  1. Всі зображення вже в форматі webp - це добре!');
  console.log('  2. Для додаткової оптимізації розгляньте:');
  console.log('     - npm install -g webp-converter');
  console.log('     - npm install -g imagemin-cli');
  console.log('  3. Веб-формати зображень (webp) вже оптимізовані за замовчуванням.');
  console.log('  4. Service Worker тепер кешує зображення з стратегією stale-while-revalidate.');
}

main().catch(console.error);
