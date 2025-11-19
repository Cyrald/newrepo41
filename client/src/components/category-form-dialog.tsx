import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { useToast } from "@/hooks/use-toast"
import { useCreateCategory, useUpdateCategory } from "@/hooks/useCategories"
import type { Category } from "@shared/schema"

const categorySchema = z.object({
  name: z.string().min(1, "Укажите название категории"),
  slug: z.string().min(1, "Укажите slug категории").regex(/^[a-z0-9-]+$/, "Slug должен содержать только латинские буквы, цифры и дефисы"),
  description: z.string().optional(),
  sortOrder: z.coerce.number().min(0, "Порядок не может быть отрицательным").default(0),
})

type CategoryFormData = z.infer<typeof categorySchema>

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}

export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()

  const isEditMode = !!category

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name || "",
      slug: category?.slug || "",
      description: category?.description || "",
      sortOrder: category?.sortOrder || 0,
    },
  })

  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name || "",
        slug: category.slug || "",
        description: category.description || "",
        sortOrder: category.sortOrder || 0,
      })
    } else {
      form.reset({
        name: "",
        slug: "",
        description: "",
        sortOrder: 0,
      })
    }
  }, [category, form])

  const onSubmit = async (data: CategoryFormData) => {
    try {
      if (isEditMode) {
        await updateCategory.mutateAsync({
          id: category.id,
          data,
        })
      } else {
        await createCategory.mutateAsync(data)
      }
      
      await queryClient.invalidateQueries({ queryKey: ["categories"] })
      
      onOpenChange(false)
      form.reset()
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || `Не удалось ${isEditMode ? "обновить" : "создать"} категорию`,
        variant: "destructive",
      })
    }
  }

  const generateSlug = () => {
    const name = form.getValues("name")
    if (!name) return

    const translitMap: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
      'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }

    const slug = name
      .toLowerCase()
      .split('')
      .map(char => translitMap[char] || char)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')

    form.setValue("slug", slug)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Редактировать категорию" : "Добавить категорию"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Внесите изменения в категорию"
              : "Заполните информацию о новой категории"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название категории *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Например: Масла и жиры"
                        {...field}
                        onBlur={() => {
                          field.onBlur()
                          if (!isEditMode && !form.getValues("slug")) {
                            generateSlug()
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL) *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="masla-i-zhiry"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={generateSlug}
                      >
                        Сгенерировать
                      </Button>
                    </div>
                    <FormDescription>
                      Используется в URL адресе. Только латинские буквы, цифры и дефисы.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Краткое описание категории..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порядок сортировки</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        value={field.value || 0}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      Категории с меньшим числом отображаются первыми
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={createCategory.isPending || updateCategory.isPending}>
                {isEditMode ? "Сохранить изменения" : "Создать категорию"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
