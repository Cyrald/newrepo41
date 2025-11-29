import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../auth";
import { productImagesUpload, productFormDataUpload } from "../upload";
import { productImagePipeline } from "../ImagePipeline";
import { sanitizeSearchQuery, sanitizeNumericParam, sanitizeId } from "../utils/sanitize";
import { searchLimiter, uploadLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get("/", searchLimiter, async (req, res) => {
  const categoryId = req.query.categoryId as string | undefined;
  const search = req.query.search as string | undefined;
  const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
  const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
  const isNew = req.query.isNew === 'true' ? true : undefined;
  const sortBy = req.query.sortBy as "price_asc" | "price_desc" | "popularity" | "newest" | "rating" | undefined;
  const limit = sanitizeNumericParam(req.query.limit as string, 1, 100, 50);
  const offset = sanitizeNumericParam(req.query.offset as string, 0, 10000, 0);

  const sanitizedSearch = search ? sanitizeSearchQuery(search) : undefined;
  
  let categoryIds: string[] | undefined;
  if (categoryId) {
    const category = await storage.getCategory(categoryId);
    if (category) {
      categoryIds = [categoryId];
    }
  }

  const { products, total } = await storage.getProducts({
    categoryIds,
    search: sanitizedSearch,
    minPrice,
    maxPrice,
    isNew,
    sortBy,
    limit,
    offset,
  });

  const productsWithImages = await Promise.all(
    products.map(async (product) => {
      const images = await storage.getProductImages(product.id);
      return { ...product, images };
    })
  );

  res.json({ products: productsWithImages, total });
});

router.get("/:id", async (req, res) => {
  const productId = sanitizeId(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "Неверный ID товара" });
  }

  const product = await storage.getProduct(productId);
  if (!product) {
    return res.status(404).json({ message: "Товар не найден" });
  }

  const images = await storage.getProductImages(product.id);

  await storage.incrementProductView(product.id);

  res.json({ ...product, images });
});

router.post(
  "/",
  authenticateToken,
  requireRole("admin", "marketer"),
  uploadLimiter,
  productFormDataUpload.none(),
  async (req, res) => {
    const productData = { ...req.body };
    
    const stockQty = (productData.stockQuantity || '0').trim();
    if (!/^\d+$/.test(stockQty)) {
      return res.status(400).json({ message: "Некорректное количество на складе" });
    }
    productData.stockQuantity = parseInt(stockQty, 10);
    
    if (productData.shelfLifeDays && productData.shelfLifeDays !== '') {
      const daysStr = productData.shelfLifeDays.trim();
      if (/^\d+$/.test(daysStr)) {
        productData.shelfLifeDays = parseInt(daysStr, 10);
      } else {
        productData.shelfLifeDays = null;
      }
    } else {
      productData.shelfLifeDays = null;
    }
    
    if (productData.isNew !== undefined) productData.isNew = productData.isNew === 'true';
    if (productData.isArchived !== undefined) productData.isArchived = productData.isArchived === 'true';
    
    if (productData.discountStartDate && productData.discountStartDate !== '') {
      productData.discountStartDate = new Date(productData.discountStartDate);
    } else {
      productData.discountStartDate = null;
    }
    if (productData.discountEndDate && productData.discountEndDate !== '') {
      productData.discountEndDate = new Date(productData.discountEndDate);
    } else {
      productData.discountEndDate = null;
    }
    
    const product = await storage.createProduct(productData);
    res.json(product);
  }
);

router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "marketer"),
  async (req, res) => {
    const productData = { ...req.body };
    
    if (productData.discountStartDate && typeof productData.discountStartDate === 'string') {
      productData.discountStartDate = productData.discountStartDate ? new Date(productData.discountStartDate) : null;
    }
    if (productData.discountEndDate && typeof productData.discountEndDate === 'string') {
      productData.discountEndDate = productData.discountEndDate ? new Date(productData.discountEndDate) : null;
    }
    
    const product = await storage.updateProduct(req.params.id, productData);
    res.json(product);
  }
);

router.delete(
  "/:id",
  authenticateToken,
  requireRole("admin", "marketer"),
  async (req, res) => {
    await storage.deleteProduct(req.params.id);
    res.json({ message: "Товар удалён" });
  }
);

router.delete(
  "/:id/permanent",
  authenticateToken,
  requireRole("admin"),
  async (req, res) => {
    await storage.permanentDeleteProduct(req.params.id);
    res.json({ message: "Товар удалён навсегда" });
  }
);

router.post(
  "/:id/images",
  authenticateToken,
  requireRole("admin", "marketer"),
  uploadLimiter,
  productImagesUpload.array("images", 10),
  async (req, res) => {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Файлы не загружены" });
    }
    
    const existingImages = await storage.getProductImages(req.params.id);
    const placeholderImages = existingImages.filter(img => 
      img.url.includes('placeholder') || img.url.endsWith('.svg')
    );
    
    for (const placeholderImage of placeholderImages) {
      await storage.deleteProductImage(placeholderImage.id);
    }
    
    const processedImages = await productImagePipeline.processBatch(files);
    
    const dbImages = [];
    const createdImageIds: string[] = [];
    
    try {
      for (let i = 0; i < processedImages.length; i++) {
        const processedImage = processedImages[i];
        const dbImage = await storage.addProductImage({
          productId: req.params.id,
          url: processedImage.url,
          sortOrder: existingImages.length + i,
        });
        
        dbImages.push(dbImage);
        createdImageIds.push(dbImage.id);
      }
      
      res.json(dbImages);
    } catch (error: any) {
      for (const imageId of createdImageIds) {
        try {
          await storage.deleteProductImage(imageId);
        } catch {}
      }
      
      for (const processedImage of processedImages) {
        try {
          await productImagePipeline.deleteImage(processedImage.filename);
        } catch {}
      }
      
      throw error;
    }
  }
);

router.patch(
  "/:id/images/:imageId",
  authenticateToken,
  requireRole("admin", "marketer"),
  async (req, res) => {
    const { sortOrder, altText } = req.body;
    
    if (sortOrder !== undefined) {
      await storage.updateProductImageOrder(req.params.imageId, sortOrder);
    }
    
    res.json({ message: "Изображение обновлено" });
  }
);

router.delete(
  "/:id/images/:imageId",
  authenticateToken,
  requireRole("admin", "marketer"),
  async (req, res) => {
    const images = await storage.getProductImages(req.params.id);
    const imageToDelete = images.find(img => img.id === req.params.imageId);
    
    if (!imageToDelete) {
      return res.status(404).json({ message: "Изображение не найдено" });
    }
    
    await storage.deleteProductImage(req.params.imageId);
    
    const filename = imageToDelete.url.split('/').pop();
    if (filename && !filename.includes('placeholder')) {
      try {
        await productImagePipeline.deleteImage(filename);
      } catch (error) {
        console.warn('Failed to delete physical image file:', error);
      }
    }
    
    res.json({ message: "Изображение удалено" });
  }
);

export default router;
