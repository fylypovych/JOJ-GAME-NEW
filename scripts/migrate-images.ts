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

// Load card catalog and modules
let cardCatalog: unknown[] = [];
let modules: unknown[] = [];
try {
  const templatePath = process.env.TEMPLATE_PATH || path.join(process.cwd(), 'database', 'shared-deck-template.json');
  const templateContent = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateContent);
  cardCatalog = template.catalog || [];
  modules = template.modules || [];
  console.log(`Loaded ${cardCatalog.length} cards from catalog`);
  console.log(`Loaded ${modules.length} modules`);
} catch (error) {
  console.error('Failed to load card catalog:', error);
  console.log('Continuing without module migration for cards...');
}

// Create a map of cardId -> moduleName from modules
const cardModuleMap = new Map<string, string>();
for (const module of modules) {
  if (module && typeof module === 'object' && 'name' in module && 'cardIds' in module) {
    const moduleName = (module as { name: string }).name;
    const cardIds = (module as { cardIds: string[] }).cardIds || [];
    for (const cardId of cardIds) {
      cardModuleMap.set(cardId, moduleName);
    }
  }
}

// Also create a map of cardId -> image path from catalog
const cardImageMap = new Map<string, string>();
for (const card of cardCatalog) {
  if (card && typeof card === 'object' && 'id' in card && 'image' in card) {
    const cardId = (card as { id: string }).id;
    const imagePath = (card as { image: string }).image;
    cardImageMap.set(cardId, imagePath);
  }
}

// Get module name for a card by filename
const getModuleForCard = (filename: string): string | undefined => {
  // Try to extract cardId from filename
  const cardIdMatch = filename.match(/^(\d{13,})-/); // UUID-like pattern
  if (cardIdMatch) {
    const cardId = cardIdMatch[1];
    return cardModuleMap.get(cardId);
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
    
    // Extract current directory name from path
    const pathParts = oldPath.split('/');
    const currentDir = pathParts.length > 3 ? pathParts[3] : '';
    
    // Skip if already in a module directory (starts with 2026.)
    if (currentDir && currentDir.startsWith('2026.')) {
      console.log(`  Skipping ${fileName} - already in module directory: ${currentDir}`);
      continue;
    }
    
    const moduleName = getModuleForCard(fileName) || 'uncategorized';
    
    const oldFilePath = await findOldFile(fileName);
    if (!oldFilePath) {
      console.log(`  Skipping ${fileName} - file not found in old directories`);
      continue;
    }
    
    const newDir = path.join(CARD_ASSETS_DIR, moduleName);
    const newFilePath = path.join(newDir, fileName);
    const newPath = `/public/card-assets/${moduleName}/${fileName}`;
    
    try {
      // Check if newPath already exists in database
      const existingPath = await pool.query(
        `SELECT path FROM uploaded_assets WHERE path = $1`,
        [newPath]
      );
      
      if (existingPath.rows.length > 0) {
        console.log(`  Skipping ${fileName} - target path already exists: ${newPath}`);
        continue;
      }
      
      // Create target directory if needed
      await mkdir(newDir, { recursive: true });
      
      // Copy file to new location
      await copyFile(oldFilePath, newFilePath);
      
      // Update database
      await pool.query(
        `UPDATE uploaded_assets SET path = $1 WHERE path = $2`,
        [newPath, oldPath]
      );
      
      console.log(`  Migrated ${fileName}: ${oldPath} -> ${newPath} (module: ${moduleName})`);
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
