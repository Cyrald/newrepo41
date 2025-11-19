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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useCreatePromocode, useUpdatePromocode } from "@/hooks/usePromocodes"
import type { Promocode } from "@shared/schema"

const promocodeSchema = z.object({
  code: z.string().min(1, "Укажите код промокода").toUpperCase(),
  discountPercentage: z.coerce.number().min(1, "Минимум 1%").max(100, "Максимум 100%"),
  minOrderAmount: z.coerce.number().min(0, "Сумма не может быть отрицательной").default(0),
  maxDiscountAmount: z.preprocess(
    (val) => (val === "" || val === null || val === undefined) ? undefined : Number(val),
    z.number().min(0, "Сумма не может быть отрицательной").optional()
  ),
  type: z.enum(["single_use", "temporary"]),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
})

type PromocodeFormData = z.infer<typeof promocodeSchema>

interface PromocodeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  promocode?: Promocode | null
}

export function PromocodeFormDialog({ open, onOpenChange, promocode }: PromocodeFormDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const createPromocode = useCreatePromocode()
  const updatePromocode = useUpdatePromocode()

  const isEditMode = !!promocode

  const form = useForm<PromocodeFormData>({
    resolver: zodResolver(promocodeSchema),
    defaultValues: {
      code: promocode?.code || "",
      discountPercentage: promocode?.discountPercentage ? Number(promocode.discountPercentage) : 10,
      minOrderAmount: promocode?.minOrderAmount ? Number(promocode.minOrderAmount) : 0,
      maxDiscountAmount: promocode?.maxDiscountAmount ? Number(promocode.maxDiscountAmount) : "" as any,
      type: (promocode?.type as "single_use" | "temporary") || "single_use",
      expiresAt: promocode?.expiresAt
        ? new Date(promocode.expiresAt).toISOString().split("T")[0]
        : "",
      isActive: promocode?.isActive ?? true,
    },
  })

  useEffect(() => {
    if (promocode) {
      form.reset({
        code: promocode.code || "",
        discountPercentage: promocode.discountPercentage ? Number(promocode.discountPercentage) : 10,
        minOrderAmount: promocode.minOrderAmount ? Number(promocode.minOrderAmount) : 0,
        maxDiscountAmount: promocode.maxDiscountAmount ? Number(promocode.maxDiscountAmount) : "" as any,
        type: (promocode.type as "single_use" | "temporary") || "single_use",
        expiresAt: promocode.expiresAt
          ? new Date(promocode.expiresAt).toISOString().split("T")[0]
          : "",
        isActive: promocode.isActive ?? true,
      })
    } else {
      form.reset({
        code: "",
        discountPercentage: 10,
        minOrderAmount: 0,
        maxDiscountAmount: "" as any,
        type: "single_use",
        expiresAt: "",
        isActive: true,
      })
    }
  }, [promocode, form])

  const onSubmit = async (data: PromocodeFormData) => {
    try {
      const formattedData = {
        code: data.code.toUpperCase(),
        discountPercentage: data.discountPercentage.toString(),
        minOrderAmount: data.minOrderAmount.toString(),
        maxDiscountAmount: data.maxDiscountAmount ? data.maxDiscountAmount.toString() : undefined,
        type: data.type,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        isActive: data.isActive,
      }

      if (isEditMode) {
        await updatePromocode.mutateAsync({
          id: promocode.id,
          data: formattedData,
        })
      } else {
        await createPromocode.mutateAsync(formattedData)
      }
      
      await queryClient.invalidateQueries({ queryKey: ["promocodes"] })
      
      onOpenChange(false)
      form.reset()
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || `Не удалось ${isEditMode ? "обновить" : "создать"} промокод`,
        variant: "destructive",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Редактировать промокод" : "Добавить промокод"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Внесите изменения в промокод"
              : "Заполните информацию о новом промокоде"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Код промокода *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="SALE2024"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        disabled={isEditMode}
                      />
                    </FormControl>
                    <FormDescription>
                      Код автоматически переводится в верхний регистр
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="discountPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Скидка (%) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          placeholder="10"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите тип" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="single_use">Одноразовый</SelectItem>
                          <SelectItem value="temporary">Временный</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minOrderAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Мин. сумма заказа (₽) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          placeholder="0"
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxDiscountAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Макс. сумма скидки (₽)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          placeholder="Без ограничений"
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormDescription>
                        Максимальная сумма скидки, которую можно получить по промокоду
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата истечения</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Оставьте пустым если промокод действует бессрочно
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Активен
                      </FormLabel>
                      <FormDescription>
                        Только активные промокоды могут использоваться клиентами
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={createPromocode.isPending || updatePromocode.isPending}>
                {isEditMode ? "Сохранить изменения" : "Создать промокод"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
