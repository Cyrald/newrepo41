import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

export interface ImagePipelineConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
  maxFileSize: number;
}

export interface ProcessedImageResult {
  filename: string;
  url: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

interface TempFile {
  path: string;
  cleanup: () => Promise<void>;
}

const DEFAULT_CONFIG: ImagePipelineConfig = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 85,
  format: 'webp',
  maxFileSize: 50 * 1024 * 1024,
};

export class ImagePipeline {
  private uploadsDir: string;
  private tempDir: string;
  private urlPrefix: string;
  private config: ImagePipelineConfig;
  private tempFiles: Map<string, number> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly TEMP_FILE_MAX_AGE_MS = 30 * 60 * 1000;

  constructor(uploadsDir: string, urlPrefix: string, config: Partial<ImagePipelineConfig> = {}) {
    this.uploadsDir = uploadsDir;
    this.tempDir = path.join(uploadsDir, '.temp');
    this.urlPrefix = urlPrefix;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.startPeriodicCleanup();
  }
  
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleFiles();
    }, 5 * 60 * 1000);
  }
  
  private async cleanupStaleFiles(): Promise<void> {
    const now = Date.now();
    const staleFiles: string[] = [];
    
    const entries = Array.from(this.tempFiles.entries());
    for (const [filePath, timestamp] of entries) {
      if (now - timestamp > this.TEMP_FILE_MAX_AGE_MS) {
        staleFiles.push(filePath);
      }
    }
    
    for (const filePath of staleFiles) {
      try {
        await fs.unlink(filePath);
        this.tempFiles.delete(filePath);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          this.tempFiles.delete(filePath);
        }
      }
    }
    
    if (staleFiles.length > 0) {
      console.log(`[ImagePipeline] Cleaned up ${staleFiles.length} stale temp files`);
    }
  }
  
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  private async createTempFile(buffer: Buffer, originalName: string): Promise<TempFile> {
    const ext = path.extname(originalName);
    const tempPath = path.join(this.tempDir, `${randomUUID()}${ext}`);
    
    await fs.writeFile(tempPath, buffer);
    this.tempFiles.set(tempPath, Date.now());

    return {
      path: tempPath,
      cleanup: async () => {
        try {
          await fs.unlink(tempPath);
          this.tempFiles.delete(tempPath);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn(`Failed to cleanup temp file ${tempPath}:`, error);
          } else {
            this.tempFiles.delete(tempPath);
          }
        }
      }
    };
  }

  private async validateImage(buffer: Buffer): Promise<void> {
    if (buffer.length > this.config.maxFileSize) {
      throw new Error(`Размер файла превышает ${this.config.maxFileSize / 1024 / 1024} МБ`);
    }

    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new Error('Файл не является корректным изображением');
    }

    if (!metadata.format) {
      throw new Error('Не удалось определить формат изображения');
    }

    const allowedFormats = ['jpeg', 'jpg', 'png', 'webp'];
    if (!allowedFormats.includes(metadata.format)) {
      throw new Error(`Неподдерживаемый формат: ${metadata.format}. Допустимы: JPEG, PNG, WEBP`);
    }

    if (metadata.width && metadata.width > 10000) {
      throw new Error('Изображение слишком широкое (максимум 10000px)');
    }

    if (metadata.height && metadata.height > 10000) {
      throw new Error('Изображение слишком высокое (максимум 10000px)');
    }
  }

  async processImage(
    buffer: Buffer,
    originalName: string
  ): Promise<ProcessedImageResult> {
    await this.initialize();
    
    const tempFile = await this.createTempFile(buffer, originalName);
    let tempOutputPath: string | null = null;

    try {
      await this.validateImage(buffer);

      const uniqueFilename = `${Date.now()}-${randomUUID()}.${this.config.format}`;
      const finalPath = path.join(this.uploadsDir, uniqueFilename);
      tempOutputPath = path.join(this.tempDir, `out-${uniqueFilename}`);
      
      this.tempFiles.set(tempOutputPath, Date.now());

      const image = sharp(buffer);
      const metadata = await image.metadata();

      let processedImage = image;

      if (metadata.width && metadata.height) {
        if (metadata.width > this.config.maxWidth || metadata.height > this.config.maxHeight) {
          processedImage = processedImage.resize(this.config.maxWidth, this.config.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true,
          });
        }
      }

      processedImage = processedImage[this.config.format]({ quality: this.config.quality });

      const info = await processedImage.toFile(tempOutputPath);

      await fs.rename(tempOutputPath, finalPath);
      this.tempFiles.delete(tempOutputPath);
      tempOutputPath = null;

      await tempFile.cleanup();

      return {
        filename: uniqueFilename,
        url: `${this.urlPrefix}/${uniqueFilename}`,
        width: info.width,
        height: info.height,
        size: info.size,
        mimeType: `image/${this.config.format}`,
      };
    } catch (error) {
      await tempFile.cleanup();
      
      if (tempOutputPath) {
        try {
          await fs.unlink(tempOutputPath);
        } catch {}
        this.tempFiles.delete(tempOutputPath);
      }

      throw error;
    }
  }

  async processBatch(
    files: Array<{ buffer: Buffer; originalname: string }>
  ): Promise<ProcessedImageResult[]> {
    const results: ProcessedImageResult[] = [];
    const processedFiles: string[] = [];

    try {
      for (const file of files) {
        const result = await this.processImage(file.buffer, file.originalname);
        results.push(result);
        processedFiles.push(path.join(this.uploadsDir, result.filename));
      }

      return results;
    } catch (error) {
      for (const filePath of processedFiles) {
        try {
          await fs.unlink(filePath);
        } catch (unlinkError) {
          console.warn(`Failed to rollback file ${filePath}:`, unlinkError);
        }
      }

      throw error;
    }
  }

  async deleteImage(filename: string): Promise<void> {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename parameter');
    }

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: path traversal detected');
    }

    if (filename.startsWith('.')) {
      throw new Error('Invalid filename: hidden files not allowed');
    }

    const filePath = path.join(this.uploadsDir, filename);
    
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(this.uploadsDir);
    
    if (!resolvedPath.startsWith(resolvedUploadsDir + path.sep) && resolvedPath !== resolvedUploadsDir) {
      throw new Error('Path traversal attempt detected');
    }
    
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error('Не удалось удалить изображение');
      }
    }
  }

  async cleanup(): Promise<void> {
    const tempFilesArray = Array.from(this.tempFiles.keys());
    
    await Promise.allSettled(
      tempFilesArray.map(async (tempPath) => {
        try {
          await fs.unlink(tempPath);
          this.tempFiles.delete(tempPath);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn(`Failed to cleanup temp file ${tempPath}:`, error);
          } else {
            this.tempFiles.delete(tempPath);
          }
        }
      })
    );
  }
}

const productImagePipeline = new ImagePipeline(
  path.join(process.cwd(), 'uploads', 'products'),
  '/uploads/products',
  {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 85,
    format: 'webp',
  }
);

const chatImagePipeline = new ImagePipeline(
  path.join(process.cwd(), 'uploads', 'chat'),
  '/uploads/chat',
  {
    maxWidth: 800,
    maxHeight: 800,
    quality: 80,
    format: 'webp',
  }
);


export { productImagePipeline, chatImagePipeline };
