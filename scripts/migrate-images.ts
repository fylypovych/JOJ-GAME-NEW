import { access, copyFile, mkdir, readdir, rename, stat, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPostgresPool } from '../server/db/postgres';

const CARD_ASSETS_DIR = path.join(process.cwd(), 'public', 'card-assets');
const PROFILE_IMAGE_DIR = path.join(process.cwd(), 'public', 'profile-image');
const SYS_ICONS_DIR = path.join(process.cwd(), 'public', 'sys.icons');

// Possible directories for old files
const OLD_DIRS = [
  path.join(process.cwd(), 'public', 'card-assets'),
  path.join(process.cwd(), 'card-assets'),
  path.join(process.cwd(), 'cards'),
];

// Find file in old directories
const findOldFile = async (fileName: string): Promise<string | null> => {
  for (const dir of OLD_DIRS) {
    const filePath = path.join(dir, fileName);
    try {
      await access(filePath);
      return filePath;
    } catch {
      // File doesn't exist in this directory
    }
  }
  return null;
};

// Load card catalog to get categories
let cardCatalog: unknown[] = [];
try {
  const templatePath = process.env.TEMPLATE_PATH || path.join(process.cwd(), 'database', 'shared-deck-template.json');
  const templateContent = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateContent);
  cardCatalog = template.catalog || [];
  console.log(`Loaded ${cardCatalog.length} cards from catalog`);
} catch (error) {
  console.error('Failed to load card catalog:', error);
  console.log('Continuing without category migration for cards...');
}

// Create a map of cardId -> category
const cardCategoryMap = new Map<string, string>();
for (const card of cardCatalog) {
  if (card && typeof card === 'object' && 'id' in card && 'category' in card) {
    cardCategoryMap.set((card as { id: string }).id, (card as { category: string }).category);
  }
}

// Get category for a card by filename
const getCategoryForCard = (filename: string): string | undefined => {
  // Try to extract cardId from filename
  const cardIdMatch = filename.match(/^(\d{13,})-/); // UUID-like pattern
  if (cardIdMatch) {
    const cardId = cardIdMatch[1];
    return cardCategoryMap.get(cardId);
  }
  return undefined;
};

const migrateAvatars = async (pool: any) => {
  console.log('Migrating avatar images...');
  
  // Get all avatar-image assets from database
  const result = await pool.query(
    `SELECT path, file_name FROM uploaded_assets WHERE kind = 'avatar-image' AND deleted_at IS NULL`
  );
  
  let migrated = 0;
  for (const row of result.rows) {
    const oldPath = row.path;
    const fileName = row.file_name;
    
    // Skip if already in new format
    if (oldPath.startsWith('/public/profile-image/')) {
      console.log(`  Skipping ${fileName} - already in new format`);
      continue;
    }
    
    const oldFilePath = await findOldFile(fileName);
    if (!oldFilePath) {
      console.log(`  Skipping ${fileName} - file not found in old directories`);
      continue;
    }
    
    const newFilePath = path.join(PROFILE_IMAGE_DIR, fileName);
    const newPath = `/public/profile-image/${fileName}`;
    
    try {
      // Create target directory if needed
      await mkdir(PROFILE_IMAGE_DIR, { recursive: true });
      
      // Copy file to new location
      await copyFile(oldFilePath, newFilePath);
      
      // Update asset store database
      await pool.query(
        `UPDATE uploaded_assets SET path = $1 WHERE path = $2`,
        [newPath, oldPath]
      );
      
      // Update user_profiles avatar_url
      await pool.query(
        `UPDATE user_profiles SET avatar_url = $1 WHERE avatar_url = $2`,
        [newPath, oldPath]
      );
      
      console.log(`  Migrated ${fileName}: ${oldPath} -> ${newPath}`);
      migrated++;
      
      // Delete old file
      await unlink(oldFilePath);
    } catch (error) {
      console.error(`  Failed to migrate ${fileName}:`, error);
    }
  }
  
  console.log(`Migrated ${migrated} avatar images`);
};

const migrateCardImages = async (pool: any) => {
  console.log('Migrating card images...');
  
  // Get all card-image assets from database
  const result = await pool.query(
    `SELECT path, file_name FROM uploaded_assets WHERE kind = 'card-image' AND deleted_at IS NULL`
  );
  
  let migrated = 0;
  for (const row of result.rows) {
    const oldPath = row.path;
    const fileName = row.file_name;
    
    // Skip if already in new format (contains category)
    if (oldPath.startsWith('/public/card-assets/') && oldPath.split('/').length > 3) {
      console.log(`  Skipping ${fileName} - already in new format`);
      continue;
    }
    
    const category = getCategoryForCard(fileName) || 'uncategorized';
    
    const oldFilePath = await findOldFile(fileName);
    if (!oldFilePath) {
      console.log(`  Skipping ${fileName} - file not found in old directories`);
      continue;
    }
    
    const newDir = path.join(CARD_ASSETS_DIR, category);
    const newFilePath = path.join(newDir, fileName);
    const newPath = `/public/card-assets/${category}/${fileName}`;
    
    try {
      // Create target directory if needed
      await mkdir(newDir, { recursive: true });
      
      // Copy file to new location
      await copyFile(oldFilePath, newFilePath);
      
      // Update database
      await pool.query(
        `UPDATE uploaded_assets SET path = $1 WHERE path = $2`,
        [newPath, oldPath]
      );
      
      console.log(`  Migrated ${fileName}: ${oldPath} -> ${newPath} (category: ${category})`);
      migrated++;
      
      // Delete old file
      await unlink(oldFilePath);
    } catch (error) {
      console.error(`  Failed to migrate ${fileName}:`, error);
    }
  }
  
  console.log(`Migrated ${migrated} card images`);
};

const migrateSystemIcons = async (pool: any) => {
  console.log('Migrating system icons...');
  
  // Create sys.icons directory
  await mkdir(SYS_ICONS_DIR, { recursive: true });
  
  // Get resource-icons and admin-icons from public directory
  const resourceIconsDir = path.join(process.cwd(), 'public', 'resource-icons');
  const adminIconsDir = path.join(process.cwd(), 'public', 'admin-icons');
  
  let migrated = 0;
  
  // Migrate resource-icons
  try {
    const entries = await readdir(resourceIconsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      const oldFilePath = path.join(resourceIconsDir, entry.name);
      const newFilePath = path.join(SYS_ICONS_DIR, entry.name);
      const newPath = `/sys.icons/${entry.name}`;
      
      try {
        await copyFile(oldFilePath, newFilePath);
        
        // Add to database if not exists
        const fileStat = await stat(newFilePath);
        await pool.query(
          `INSERT INTO uploaded_assets (path, file_name, mime, size_bytes, kind, source, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, 'system-icon', 'migration', now(), null)
           ON CONFLICT (path) DO NOTHING`,
          [newPath, entry.name, 'image/png', fileStat.size]
        );
        
        console.log(`  Migrated resource-icon ${entry.name}`);
        migrated++;
      } catch (error) {
        console.error(`  Failed to migrate resource-icon ${entry.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to migrate resource-icons:', error);
  }
  
  // Migrate admin-icons
  try {
    const entries = await readdir(adminIconsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      const oldFilePath = path.join(adminIconsDir, entry.name);
      const newFilePath = path.join(SYS_ICONS_DIR, entry.name);
      const newPath = `/sys.icons/${entry.name}`;
      
      try {
        await copyFile(oldFilePath, newFilePath);
        
        // Add to database if not exists
        const fileStat = await stat(newFilePath);
        await pool.query(
          `INSERT INTO uploaded_assets (path, file_name, mime, size_bytes, kind, source, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, 'system-icon', 'migration', now(), null)
           ON CONFLICT (path) DO NOTHING`,
          [newPath, entry.name, 'image/svg+xml', fileStat.size]
        );
        
        console.log(`  Migrated admin-icon ${entry.name}`);
        migrated++;
      } catch (error) {
        console.error(`  Failed to migrate admin-icon ${entry.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to migrate admin-icons:', error);
  }
  
  console.log(`Migrated ${migrated} system icons`);
};

const main = async () => {
  console.log('Starting image migration...');
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  const pool = createPostgresPool(databaseUrl);
  
  try {
    await migrateAvatars(pool);
    await migrateCardImages(pool);
    await migrateSystemIcons(pool);
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

main();
