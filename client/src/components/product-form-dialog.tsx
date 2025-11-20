import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Upload, X, Image as ImageIcon, FileCheck } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useCreateProduct, useUpdateProduct, useUploadProductImages, useProduct, useDeleteProductImage } from "@/hooks/useProducts"
import { useCategories } from "@/hooks/useCategories"
import { productsApi } from "@/lib/api"
import type { Product } from "@shared/schema"

const productSchema = z.object({
  categoryId: z.string().min(1, "Выберите категорию"),
  sku: z.string().min(1, "Укажите артикул"),
  name: z.string().min(1, "Укажите название"),
  description: z.string().min(10, "Описание должно содержать минимум 10 символов"),
  composition: z.string().min(1, "Укажите состав"),
  storageConditions: z.string().min(1, "Укажите условия хранения"),
  usageInstructions: z.string().optional(),
  contraindications: z.string().optional(),
  weight: z.string().optional(),
  volume: z.string().optional(),
  dimensionsHeight: z.string().optional(),
  dimensionsLength: z.string().optional(),
  dimensionsWidth: z.string().optional(),
  shelfLifeDays: z.string().optional(),
  stockQuantity: z.number().min(0, "Количество не может быть отрицательным"),
  price: z.string().min(1, "Укажите цену"),
  discountPercentage: z.string().optional(),
  discountStartDate: z.string().optional(),
  discountEndDate: z.string().optional(),
  isNew: z.boolean().default(false),
  isPublished: z.boolean().default(true),
})

type ProductFormData = z.infer<typeof productSchema>

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
}

// Combined image type that handles both existing and new images
interface CombinedImage {
  id?: string // Existing image has id
  url: string // URL for preview (blob URL for new, server URL for existing)
  file?: File // New image has file
  isNew: boolean // Flag to indicate if this is a new image
  sortOrder: number
}

export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: categoriesData } = useCategories()
  const categories = categoriesData || []
  
  const { data: fullProduct, refetch } = useProduct(product?.id || "")
  
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const uploadImages = useUploadProductImages()
  const deleteImage = useDeleteProductImage()
  
  const [combinedImages, setCombinedImages] = useState<CombinedImage[]>([])
  const [isSaved, setIsSaved] = useState(false)

  const isEditMode = !!product

  useEffect(() => {
    if (open && isEditMode && product?.id) {
      refetch()
    }
  }, [open, isEditMode, product?.id])

  useEffect(() => {
    if (fullProduct && (fullProduct as any).images) {
      const existingImages: CombinedImage[] = ((fullProduct as any).images || []).map((img: any, index: number) => ({
        id: img.id,
        url: img.url,
        isNew: false,
        sortOrder: index,
      }))
      setCombinedImages(existingImages)
    } else if (!isEditMode) {
      setCombinedImages([])
    }
  }, [fullProduct, isEditMode])

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      categoryId: product?.categoryId || "",
      sku: product?.sku || "",
      name: product?.name || "",
      description: product?.description || "",
      composition: product?.composition || "",
      storageConditions: product?.storageConditions || "",
      usageInstructions: product?.usageInstructions || "",
      contraindications: product?.contraindications || "",
      weight: product?.weight || "",
      volume: product?.volume || "",
      dimensionsHeight: product?.dimensionsHeight || "",
      dimensionsLength: product?.dimensionsLength || "",
      dimensionsWidth: product?.dimensionsWidth || "",
      shelfLifeDays: product?.shelfLifeDays?.toString() || "",
      stockQuantity: product?.stockQuantity || 0,
      price: product?.price || "",
      discountPercentage: product?.discountPercentage || "0",
      discountStartDate: product?.discountStartDate
        ? new Date(product.discountStartDate).toISOString().split("T")[0]
        : "",
      discountEndDate: product?.discountEndDate
        ? new Date(product.discountEndDate).toISOString().split("T")[0]
        : "",
      isNew: product?.isNew || false,
      isPublished: !product?.isArchived,
    },
  })

  useEffect(() => {
    if (product) {
      form.reset({
        categoryId: product.categoryId || "",
        sku: product.sku || "",
        name: product.name || "",
        description: product.description || "",
        composition: product.composition || "",
        storageConditions: product.storageConditions || "",
        usageInstructions: product.usageInstructions || "",
        contraindications: product.contraindications || "",
        weight: product.weight || "",
        volume: product.volume || "",
        dimensionsHeight: product.dimensionsHeight || "",
        dimensionsLength: product.dimensionsLength || "",
        dimensionsWidth: product.dimensionsWidth || "",
        shelfLifeDays: product.shelfLifeDays?.toString() || "",
        stockQuantity: product.stockQuantity || 0,
        price: product.price || "",
        discountPercentage: product.discountPercentage || "0",
        discountStartDate: product.discountStartDate
          ? new Date(product.discountStartDate).toISOString().split("T")[0]
          : "",
        discountEndDate: product.discountEndDate
          ? new Date(product.discountEndDate).toISOString().split("T")[0]
          : "",
        isNew: product.isNew || false,
        isPublished: !product.isArchived,
      })
    } else {
      form.reset({
        categoryId: "",
        sku: "",
        name: "",
        description: "",
        composition: "",
        storageConditions: "",
        usageInstructions: "",
        contraindications: "",
        weight: "",
        volume: "",
        dimensionsHeight: "",
        dimensionsLength: "",
        dimensionsWidth: "",
        shelfLifeDays: "",
        stockQuantity: 0,
        price: "",
        discountPercentage: "0",
        discountStartDate: "",
        discountEndDate: "",
        isNew: false,
        isPublished: true,
      })
    }
  }, [product, form])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newImages: CombinedImage[] = files.slice(0, 10 - combinedImages.length).map((file, index) => ({
      url: URL.createObjectURL(file),
      file,
      isNew: true,
      sortOrder: combinedImages.length + index,
    }))

    // Add new images to the END of the list
    setCombinedImages(prev => [...prev, ...newImages])
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    )
    
    if (files.length === 0) return
    
    const newImages: CombinedImage[] = files.slice(0, 10 - combinedImages.length).map((file, index) => ({
      url: URL.createObjectURL(file),
      file,
      isNew: true,
      sortOrder: combinedImages.length + index,
    }))

    // Add new images to the END of the list
    setCombinedImages(prev => [...prev, ...newImages])
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleRemoveImage = async (index: number) => {
    const image = combinedImages[index]
    
    if (!image.isNew && image.id) {
      // Remove existing image from server
      try {
        await deleteImage.mutateAsync(image.id)
      } catch (error: any) {
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось удалить изображение",
          variant: "destructive",
        })
        return
      }
    } else if (image.url.startsWith('blob:')) {
      // Revoke blob URL for new images
      URL.revokeObjectURL(image.url)
    }
    
    setCombinedImages(prev => prev.filter((_, i) => i !== index))
  }

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    
    const newImages = [...combinedImages]
    const [movedImage] = newImages.splice(fromIndex, 1)
    newImages.splice(toIndex, 0, movedImage)
    
    // Update sortOrder
    const updatedImages = newImages.map((img, index) => ({
      ...img,
      sortOrder: index,
    }))
    
    setCombinedImages(updatedImages)
  }

  const canAddMore = combinedImages.length < 10

  const onSubmit = async (data: ProductFormData) => {
    try {
      const formData = new FormData()
      
      formData.append("categoryId", data.categoryId)
      formData.append("sku", data.sku)
      formData.append("name", data.name)
      formData.append("description", data.description)
      formData.append("composition", data.composition)
      formData.append("storageConditions", data.storageConditions)
      if (data.usageInstructions) formData.append("usageInstructions", data.usageInstructions)
      if (data.contraindications) formData.append("contraindications", data.contraindications)
      if (data.weight) formData.append("weight", data.weight)
      if (data.volume) formData.append("volume", data.volume)
      if (data.dimensionsHeight) formData.append("dimensionsHeight", data.dimensionsHeight)
      if (data.dimensionsLength) formData.append("dimensionsLength", data.dimensionsLength)
      if (data.dimensionsWidth) formData.append("dimensionsWidth", data.dimensionsWidth)
      if (data.shelfLifeDays) formData.append("shelfLifeDays", data.shelfLifeDays)
      formData.append("stockQuantity", data.stockQuantity.toString())
      formData.append("price", data.price)
      if (data.discountPercentage) formData.append("discountPercentage", data.discountPercentage)
      if (data.discountStartDate) formData.append("discountStartDate", data.discountStartDate)
      if (data.discountEndDate) formData.append("discountEndDate", data.discountEndDate)
      formData.append("isNew", data.isNew.toString())
      formData.append("isArchived", (!data.isPublished).toString())

      // Extract new images (those with file property)
      const newImagesWithFiles = combinedImages.filter(img => img.file)
      newImagesWithFiles.forEach((img) => {
        if (img.file) {
          formData.append(`images`, img.file)
        }
      })

      if (isEditMode && product) {
        await updateProduct.mutateAsync({
          id: product.id,
          data: {
            categoryId: data.categoryId,
            sku: data.sku,
            name: data.name,
            description: data.description,
            composition: data.composition,
            storageConditions: data.storageConditions,
            usageInstructions: data.usageInstructions || null,
            contraindications: data.contraindications || undefined,
            weight: data.weight || undefined,
            volume: data.volume || undefined,
            dimensionsHeight: data.dimensionsHeight || undefined,
            dimensionsLength: data.dimensionsLength || undefined,
            dimensionsWidth: data.dimensionsWidth || undefined,
            shelfLifeDays: data.shelfLifeDays ? parseInt(data.shelfLifeDays) : undefined,
            stockQuantity: data.stockQuantity,
            price: data.price,
            discountPercentage: data.discountPercentage || undefined,
            discountStartDate: data.discountStartDate ? new Date(data.discountStartDate) : undefined,
            discountEndDate: data.discountEndDate ? new Date(data.discountEndDate) : undefined,
            isNew: data.isNew,
            isArchived: !data.isPublished,
          },
        })

        // Upload new images if any
        if (newImagesWithFiles.length > 0) {
          const imageFormData = new FormData()
          newImagesWithFiles.forEach((img) => {
            if (img.file) {
              imageFormData.append('images', img.file)
            }
          })
          await uploadImages.mutateAsync({ productId: product.id, images: imageFormData })
        }

        // Reorder all images according to their position in combinedImages
        const imageOrders = combinedImages
          .map((img, index) => {
            if (img.id) {
              return { imageId: img.id, sortOrder: index }
            }
            return null
          })
          .filter(Boolean) as Array<{ imageId: string; sortOrder: number }>

        if (imageOrders.length > 0) {
          await productsApi.reorderImages(product.id, imageOrders)
        }

        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 2000)
        
        await queryClient.invalidateQueries({ queryKey: ["adminProducts"] })
        await queryClient.invalidateQueries({ queryKey: ["products", product.id] })
        await refetch()
      } else {
        const response = await fetch("/api/products", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || "Ошибка создания товара")
        }

        const newProduct = await response.json()

        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 2000)

        await queryClient.invalidateQueries({ queryKey: ["adminProducts"] })

        onOpenChange(false)
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить товар",
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Редактировать товар" : "Добавить товар"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Внесите изменения в товар и нажмите сохранить"
              : "Заполните информацию о новом товаре"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">Общее</TabsTrigger>
                <TabsTrigger value="characteristics">Характеристики</TabsTrigger>
                <TabsTrigger value="pricing">Цена</TabsTrigger>
                <TabsTrigger value="images">Изображения</TabsTrigger>
              </TabsList>

              {/* General Tab */}
              <TabsContent value="general" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Категория *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите категорию" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Артикул *</FormLabel>
                        <FormControl>
                          <Input placeholder="ABC-123" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название *</FormLabel>
                        <FormControl>
                          <Input placeholder="Название товара" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Описание *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Подробное описание товара..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="composition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Состав *</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Состав продукта..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Characteristics Tab */}
              <TabsContent value="characteristics" className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="storageConditions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Условия хранения *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Хранить в сухом месте при температуре..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="usageInstructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Инструкция по применению</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Принимать по..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contraindications"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Противопоказания</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Индивидуальная непереносимость..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Вес (г)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="500" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="volume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Объем (мл)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="250" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shelfLifeDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Срок годности (дни)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="365" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="dimensionsLength"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Длина (см)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dimensionsWidth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ширина (см)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="5" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dimensionsHeight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Высота (см)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="15" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Pricing Tab */}
              <TabsContent value="pricing" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Цена (₽) *</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="1000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="stockQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Количество на складе *</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            placeholder="50"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                            onBlur={(e) => {
                              const num = parseInt(e.target.value) || 0;
                              field.onChange(Math.max(0, num));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-4">Скидка</h4>

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="discountPercentage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Процент скидки (%)</FormLabel>
                          <FormControl>
                            <Input 
                              type="text" 
                              placeholder="0" 
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              onBlur={(e) => {
                                const num = parseInt(e.target.value) || 0;
                                field.onChange(Math.max(0, Math.min(100, num)));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="discountStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата начала</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="discountEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата окончания</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-semibold">Статусы</h4>

                  <FormField
                    control={form.control}
                    name="isNew"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Новинка</FormLabel>
                          <FormDescription>Отображать значок "Новинка"</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isPublished"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Опубликован</FormLabel>
                          <FormDescription>Товар виден в каталоге</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              {/* Images Tab */}
              <TabsContent value="images" className="space-y-4 mt-4">
                <div className="bg-muted/50 p-4 rounded-lg mb-4">
                  <h4 className="text-sm font-semibold mb-2">Требования к изображениям</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Минимальное разрешение: 900×1200 пикселей</li>
                    <li>• Соотношение сторон: 3:4 (вертикальное)</li>
                    <li>• Форматы: PNG, JPG, WEBP</li>
                    <li>• Максимальный размер файла: 50 МБ</li>
                    <li>• Первое изображение отображается в каталоге</li>
                    <li>• Перетаскивайте изображения для изменения порядка</li>
                  </ul>
                </div>
                
                <div className="space-y-4">
                  {/* Combined images grid */}
                  {combinedImages.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Изображения ({combinedImages.length}/10)</h4>
                      <div className="grid grid-cols-5 gap-3">
                        {combinedImages.map((image, index) => (
                          <div 
                            key={image.id || image.url} 
                            className="relative group cursor-move"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move"
                              e.dataTransfer.setData("text/plain", index.toString())
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = "move"
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const fromIndex = parseInt(e.dataTransfer.getData("text/plain"))
                              if (fromIndex !== index) {
                                moveImage(fromIndex, index)
                              }
                            }}
                          >
                            <div className="aspect-[3/4] w-full">
                              <img
                                src={image.url}
                                alt={`Изображение ${index + 1}`}
                                className={`w-full h-full object-cover rounded-lg border ${
                                  image.isNew ? 'border-primary border-2' : ''
                                }`}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index)}
                              className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <div className="absolute bottom-2 left-2">
                              {image.isNew ? (
                                <Badge variant="default" className="text-xs">Новый</Badge>
                              ) : (
                                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">
                                  {index === 0 ? "Главное" : index + 1}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Upload area */}
                  <div 
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-muted-foreground/50 transition-colors w-full min-h-[200px]"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                      id="image-upload"
                      disabled={!canAddMore}
                    />
                    <label
                      htmlFor="image-upload"
                      className={`flex flex-col items-center justify-center h-full cursor-pointer p-8 ${
                        !canAddMore ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground text-center">
                        {!canAddMore
                          ? `Максимум 10 изображений (уже ${combinedImages.length})`
                          : `Нажмите или перетащите изображения сюда`}
                      </p>
                      <p className="text-xs text-muted-foreground/75 mt-2">
                        ({combinedImages.length}/10)
                      </p>
                    </label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={createProduct.isPending || updateProduct.isPending || isSaved}
              >
                {isSaved ? (
                  <>
                    <FileCheck className="h-4 w-4 mr-2" />
                    Сохранено
                  </>
                ) : createProduct.isPending || updateProduct.isPending ? (
                  "Сохранение..."
                ) : isEditMode ? (
                  "Сохранить"
                ) : (
                  "Создать"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
