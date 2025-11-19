import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronLeft, ChevronRight, Package, Truck, CreditCard, CheckCircle } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { useCart } from "@/hooks/useCart"
import { useMe } from "@/hooks/useAuth"
import { useCreateOrder } from "@/hooks/useOrders"
import { useAuthStore } from "@/stores/authStore"
import { useCartStore } from "@/stores/cartStore"
import { promocodesApi } from "@/lib/api"

const deliverySchema = z.object({
  city: z.string().min(1, "Укажите город"),
  street: z.string().min(1, "Укажите улицу"),
  building: z.string().min(1, "Укажите дом"),
  apartment: z.string().optional(),
  postalCode: z.string().min(6, "Укажите индекс"),
  firstName: z.string().min(1, "Укажите имя"),
  lastName: z.string().optional(),
  patronymic: z.string().optional(),
  phone: z.string().min(11, "Укажите телефон"),
  email: z.string().email("Неверный email"),
  comment: z.string().optional(),
})

type DeliveryFormData = z.infer<typeof deliverySchema>

const STEPS = [
  { id: 1, title: "Адрес", icon: Package },
  { id: 2, title: "Доставка", icon: Truck },
  { id: 3, title: "Оплата", icon: CreditCard },
  { id: 4, title: "Подтверждение", icon: CheckCircle },
]

export default function CheckoutPage() {
  const [, setLocation] = useLocation()
  const { toast} = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [deliveryMethod, setDeliveryMethod] = useState<"cdek" | "boxberry">("cdek")
  const [deliveryType, setDeliveryType] = useState<"pvz" | "postamat" | "courier">("pvz")
  const [paymentMethod, setPaymentMethod] = useState<"online" | "on_delivery">("online")
  const [useBonuses, setUseBonuses] = useState(false)
  const [promocode, setPromocode] = useState("")
  const [appliedPromocode, setAppliedPromocode] = useState<{
    id: string;
    code: string;
    discountAmount: number;
  } | null>(null)
  const [bonusesUsed, setBonusesUsed] = useState(0)
  
  const authInitialized = useAuthStore((state) => state.authInitialized)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const { data: user } = useMe()
  const { data: cartData, isLoading: cartLoading } = useCart()
  const cartItems = useCartStore((state) => state.items)
  const createOrder = useCreateOrder()

  useEffect(() => {
    if (authInitialized && !isAuthenticated) {
      setLocation("/login?returnUrl=/checkout")
    }
  }, [authInitialized, isAuthenticated, setLocation])

  useEffect(() => {
    if (authInitialized && isAuthenticated && cartItems && cartItems.length === 0) {
      setLocation("/cart")
    }
  }, [authInitialized, isAuthenticated, cartItems, setLocation])

  if (!authInitialized || cartLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  const subtotal = cartItems.reduce((sum, item) => {
    if (!item.product?.price) return sum
    const price = typeof item.product.price === 'string' 
      ? parseFloat(item.product.price) 
      : Number(item.product.price)
    if (isNaN(price) || price < 0) return sum
    return sum + (price * item.quantity)
  }, 0)
  
  const deliveryCost = deliveryMethod === "cdek" ? 300 : 250
  const deliveryEta = deliveryMethod === "cdek" ? "2-5 дней" : "2-4 дня"
  const bonusPoints = user?.bonusBalance || 0
  
  const promocodeDiscount = appliedPromocode?.discountAmount || 0
  const subtotalAfterPromocode = Math.max(0, subtotal - promocodeDiscount)
  
  const maxBonuses = Math.floor(subtotalAfterPromocode * 0.2)
  const cappedBonusesUsed = Math.min(bonusesUsed, Math.min(bonusPoints, maxBonuses))
  const subtotalAfterBonuses = Math.max(0, subtotalAfterPromocode - cappedBonusesUsed)
  
  const finalTotal = Math.max(0, subtotalAfterBonuses + deliveryCost)

  useEffect(() => {
    if (appliedPromocode && subtotal > 0) {
      setAppliedPromocode(null)
      setPromocode("")
    }
  }, [cartItems])

  const form = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      city: "",
      street: "",
      building: "",
      apartment: "",
      postalCode: "",
      firstName: "",
      lastName: "",
      patronymic: "",
      phone: "",
      email: "",
      comment: "",
    },
  })

  const handleNext = async () => {
    if (currentStep === 1) {
      const isValid = await form.trigger()
      if (!isValid) {
        toast({
          title: "Ошибка",
          description: "Заполните все обязательные поля",
          variant: "destructive",
        })
        return
      }
    }
    
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const onSubmitDelivery = (data: DeliveryFormData) => {
    console.log("Delivery data:", data)
    handleNext()
  }

  const handleSubmitOrder = async () => {
    try {
      const deliveryData = form.getValues()
      
      const orderItems = cartItems.map((item) => ({
        productId: item.productId,
        name: item.product?.name || "",
        price: item.product?.price || "0",
        quantity: item.quantity,
        discount: item.product?.discountPercentage || "0",
      }))

      await createOrder.mutateAsync({
        items: orderItems,
        deliveryService: deliveryMethod,
        deliveryType: deliveryType,
        deliveryAddress: {
          city: deliveryData.city,
          street: deliveryData.street,
          building: deliveryData.building,
          apartment: deliveryData.apartment || undefined,
          postalCode: deliveryData.postalCode,
        },
        paymentMethod,
        promocodeId: appliedPromocode?.id,
        bonusesUsed: cappedBonusesUsed,
      })
      
      setLocation("/profile")
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать заказ",
        variant: "destructive",
      })
    }
  }

  const handleApplyPromocode = async () => {
    if (!promocode) {
      toast({
        title: "Ошибка",
        description: "Введите промокод",
        variant: "destructive",
      })
      return
    }

    // Проверка: нельзя одновременно использовать промокод и бонусы
    if (bonusesUsed > 0) {
      toast({
        title: "Ошибка",
        description: "Нельзя одновременно использовать промокод и бонусы. Сначала отключите использование бонусов.",
        variant: "destructive",
      })
      return
    }

    try {
      const result = await promocodesApi.validate(promocode, subtotal)
      
      if (result.valid && result.promocode && result.discountAmount !== undefined) {
        setAppliedPromocode({
          id: result.promocode.id,
          code: result.promocode.code,
          discountAmount: result.discountAmount,
        })
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Промокод недействителен",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось применить промокод",
        variant: "destructive",
      })
    }
  }

  const handleUseBonuses = (checked: boolean) => {
    if (checked && appliedPromocode) {
      toast({
        title: "Ошибка",
        description: "Нельзя одновременно использовать промокод и бонусы. Сначала отмените промокод.",
        variant: "destructive",
      })
      return
    }

    setUseBonuses(checked)
    const maxBonuses = Math.floor(subtotalAfterPromocode * 0.2)
    if (checked) {
      setBonusesUsed(Math.min(bonusPoints, maxBonuses))
    } else {
      setBonusesUsed(0)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 font-serif text-3xl md:text-4xl font-semibold" data-testid="text-page-title">
            Оформление заказа
          </h1>

          {/* Steps Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const Icon = step.icon
                const isActive = currentStep === step.id
                const isCompleted = currentStep > step.id

                return (
                  <div key={step.id} className="flex flex-1 items-center">
                    <div
                      className={`flex flex-col items-center ${
                        index < STEPS.length - 1 ? "flex-1" : ""
                      }`}
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                          isActive
                            ? "border-primary bg-primary text-primary-foreground"
                            : isCompleted
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`mt-2 text-sm font-medium ${
                          isActive || isCompleted
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>

                    {index < STEPS.length - 1 && (
                      <div
                        className={`mx-4 h-0.5 flex-1 ${
                          isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  {/* Step 1: Delivery Address */}
                  {currentStep === 1 && (
                    <div>
                      <h2 className="mb-6 font-serif text-2xl font-semibold">
                        Адрес доставки
                      </h2>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmitDelivery)} className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Имя *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-first-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Фамилия</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-last-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="phone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Телефон *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="tel"
                                      placeholder="+7 (900) 123-45-67"
                                      {...field}
                                      data-testid="input-phone"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Email *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="email"
                                      {...field}
                                      data-testid="input-email"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="city"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Город *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-city" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="postalCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Индекс *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-postal-code" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="street"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Улица *</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-street" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid gap-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name="building"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Дом *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-building" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="apartment"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Квартира</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-apartment" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="comment"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Комментарий к заказу</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Дополнительная информация для курьера"
                                    {...field}
                                    data-testid="input-comment"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="flex justify-end">
                            <Button type="submit" data-testid="button-next-step">
                              Продолжить
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </div>
                  )}

                  {/* Step 2: Delivery Method */}
                  {currentStep === 2 && (
                    <div>
                      <h2 className="mb-6 font-serif text-2xl font-semibold">
                        Способ доставки
                      </h2>
                      
                      {/* Delivery Service Selection */}
                      <div className="mb-6">
                        <h3 className="mb-4 text-sm font-semibold">Служба доставки</h3>
                        <RadioGroup value={deliveryMethod} onValueChange={(value) => setDeliveryMethod(value as "cdek" | "boxberry")}>
                          <div className="space-y-3">
                            <Card className={deliveryMethod === "cdek" ? "border-primary" : ""}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value="cdek" id="cdek" data-testid="radio-cdek" />
                                  <div className="flex-1">
                                    <label htmlFor="cdek" className="font-semibold cursor-pointer">
                                      СДЭК
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Доставка курьером или в пункт выдачи
                                    </p>
                                    <p className="mt-2 font-semibold">300 ₽ • 2-5 дней</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className={deliveryMethod === "boxberry" ? "border-primary" : ""}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value="boxberry" id="boxberry" data-testid="radio-boxberry" />
                                  <div className="flex-1">
                                    <label htmlFor="boxberry" className="font-semibold cursor-pointer">
                                      Boxberry
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Доставка в пункт выдачи
                                    </p>
                                    <p className="mt-2 font-semibold">250 ₽ • 2-4 дня</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Delivery Type Selection */}
                      <div>
                        <h3 className="mb-4 text-sm font-semibold">Тип доставки</h3>
                        <RadioGroup value={deliveryType} onValueChange={(value) => setDeliveryType(value as "pvz" | "postamat" | "courier")}>
                          <div className="space-y-3">
                            <Card className={deliveryType === "pvz" ? "border-primary" : ""}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value="pvz" id="pvz" data-testid="radio-pvz" />
                                  <div className="flex-1">
                                    <label htmlFor="pvz" className="font-semibold cursor-pointer">
                                      Пункт выдачи заказов (ПВЗ)
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Заберите заказ в удобное время
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className={deliveryType === "postamat" ? "border-primary" : ""}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value="postamat" id="postamat" data-testid="radio-postamat" />
                                  <div className="flex-1">
                                    <label htmlFor="postamat" className="font-semibold cursor-pointer">
                                      Постамат
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Круглосуточная выдача из постамата
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            <Card className={deliveryType === "courier" ? "border-primary" : ""}>
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <RadioGroupItem value="courier" id="courier" data-testid="radio-courier" />
                                  <div className="flex-1">
                                    <label htmlFor="courier" className="font-semibold cursor-pointer">
                                      Курьером до двери
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                      Доставка по указанному адресу
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </RadioGroup>

                        {/* Mock city/pickup point selection for PVZ/Postamat */}
                        {(deliveryType === "pvz" || deliveryType === "postamat") && (
                          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground">
                              📍 <strong>Выбранная точка:</strong> {form.getValues("city") || "Москва"}, {deliveryType === "pvz" ? "ПВЗ" : "Постамат"} на ул. Ленина, 15
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              (Интеграция с API СДЭК/Boxberry для выбора точек будет добавлена позже)
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-6 flex justify-between">
                        <Button variant="outline" onClick={handleBack} data-testid="button-back">
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Назад
                        </Button>
                        <Button onClick={handleNext} data-testid="button-next-step">
                          Продолжить
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Payment Method */}
                  {currentStep === 3 && (
                    <div>
                      <h2 className="mb-6 font-serif text-2xl font-semibold">
                        Способ оплаты
                      </h2>
                      <RadioGroup value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "online" | "on_delivery")}>
                        <div className="space-y-4">
                          <Card className={paymentMethod === "online" ? "border-primary" : ""}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <RadioGroupItem value="online" id="online" data-testid="radio-online-payment" />
                                <div className="flex-1">
                                  <label htmlFor="online" className="font-semibold cursor-pointer">
                                    Онлайн-оплата (ЮKassa)
                                  </label>
                                  <p className="text-sm text-muted-foreground">
                                    Банковской картой или через СБП
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className={paymentMethod === "on_delivery" ? "border-primary" : ""}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <RadioGroupItem value="on_delivery" id="on_delivery" data-testid="radio-cash-payment" />
                                <div className="flex-1">
                                  <label htmlFor="cash" className="font-semibold cursor-pointer">
                                    При получении
                                  </label>
                                  <p className="text-sm text-muted-foreground">
                                    Наличными или картой курьеру
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </RadioGroup>

                      <div className="mt-6 flex justify-between">
                        <Button variant="outline" onClick={handleBack} data-testid="button-back">
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Назад
                        </Button>
                        <Button onClick={handleNext} data-testid="button-next-step">
                          Продолжить
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Confirmation */}
                  {currentStep === 4 && (
                    <div>
                      <h2 className="mb-6 font-serif text-2xl font-semibold">
                        Подтверждение заказа
                      </h2>

                      <div className="space-y-6">
                        {/* Contact Info */}
                        <div>
                          <h3 className="mb-2 font-semibold">Контактная информация</h3>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>{form.getValues("firstName")} {form.getValues("lastName")}</p>
                            <p>{form.getValues("phone")}</p>
                            <p>{form.getValues("email")}</p>
                          </div>
                        </div>

                        <Separator />

                        {/* Delivery Address */}
                        <div>
                          <h3 className="mb-2 font-semibold">Адрес доставки</h3>
                          <p className="text-sm text-muted-foreground">
                            {form.getValues("city")}, {form.getValues("postalCode")},<br />
                            ул. {form.getValues("street")}, д. {form.getValues("building")}
                            {form.getValues("apartment") && `, кв. ${form.getValues("apartment")}`}
                          </p>
                          {form.getValues("comment") && (
                            <p className="mt-2 text-sm text-muted-foreground">
                              <strong>Комментарий:</strong> {form.getValues("comment")}
                            </p>
                          )}
                        </div>

                        <Separator />

                        {/* Delivery Method */}
                        <div>
                          <h3 className="mb-2 font-semibold">Способ доставки</h3>
                          <p className="text-sm text-muted-foreground">
                            {deliveryMethod === "cdek" ? "СДЭК" : "Boxberry"} •{" "}
                            {deliveryType === "pvz" ? "ПВЗ" : deliveryType === "postamat" ? "Постамат" : "Курьер до двери"}
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {deliveryCost} ₽ • {deliveryEta}
                          </p>
                        </div>

                        <Separator />

                        {/* Payment Method */}
                        <div>
                          <h3 className="mb-2 font-semibold">Способ оплаты</h3>
                          <p className="text-sm text-muted-foreground">
                            {paymentMethod === "online" ? "Онлайн-оплата (ЮKassa)" : "Оплата при получении"}
                          </p>
                        </div>

                        <Separator />

                        {/* Order Items */}
                        <div>
                          <h3 className="mb-3 font-semibold">Товары в заказе</h3>
                          <div className="space-y-3">
                            {cartItems.map((item: any) => (
                              <div key={item.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                                {item.product?.images?.[0] && (
                                  <img 
                                    src={item.product.images[0].url} 
                                    alt={item.product.name}
                                    className="w-16 aspect-[3/4] object-cover rounded"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{item.product?.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {parseFloat(item.product?.price || "0")} ₽ × {item.quantity}
                                  </p>
                                </div>
                                <p className="font-semibold text-sm whitespace-nowrap">
                                  {(parseFloat(item.product?.price || "0") * item.quantity).toFixed(2)} ₽
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Order Summary in Confirmation */}
                        <Separator />
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Товары:</span>
                            <span>{subtotal.toFixed(2)} ₽</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Доставка:</span>
                            <span>{deliveryCost.toFixed(2)} ₽</span>
                          </div>
                          {promocodeDiscount > 0 && (
                            <div className="flex justify-between text-primary">
                              <span>Скидка по промокоду:</span>
                              <span>-{promocodeDiscount.toFixed(2)} ₽</span>
                            </div>
                          )}
                          {cappedBonusesUsed > 0 && (
                            <div className="flex justify-between text-primary">
                              <span>Бонусов списано:</span>
                              <span>-{cappedBonusesUsed.toFixed(2)} ₽</span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between text-lg font-semibold pt-2">
                            <span>Итого к оплате:</span>
                            <span>{finalTotal.toFixed(2)} ₽</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-between">
                        <Button variant="outline" onClick={handleBack} data-testid="button-back">
                          <ChevronLeft className="mr-2 h-4 w-4" />
                          Назад
                        </Button>
                        <Button onClick={handleSubmitOrder} disabled={createOrder.isPending} data-testid="button-submit-order">
                          {createOrder.isPending ? "Оформление..." : "Оформить заказ"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Order Summary */}
            <div>
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>Ваш заказ</CardTitle>
                  <CardDescription>{cartItems.length} товаров</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Товары</span>
                      <span data-testid="text-subtotal">{subtotal.toFixed(2)} ₽</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Доставка</span>
                      <span data-testid="text-delivery">{deliveryCost.toFixed(2)} ₽</span>
                    </div>
                    {promocodeDiscount > 0 && (
                      <div className="flex justify-between text-primary">
                        <span>Скидка по промокоду</span>
                        <span data-testid="text-discount">-{promocodeDiscount.toFixed(2)} ₽</span>
                      </div>
                    )}
                    {cappedBonusesUsed > 0 && (
                      <div className="flex justify-between text-primary">
                        <span>Бонусы</span>
                        <span data-testid="text-bonuses">-{cappedBonusesUsed.toFixed(2)} ₽</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Promocode */}
                  <div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Промокод"
                        value={promocode}
                        onChange={(e) => setPromocode(e.target.value)}
                        data-testid="input-promocode"
                      />
                      <Button
                        variant="outline"
                        onClick={handleApplyPromocode}
                        data-testid="button-apply-promocode"
                      >
                        Применить
                      </Button>
                    </div>
                  </div>

                  {/* Bonuses */}
                  {bonusPoints > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            id="use-bonuses" 
                            checked={useBonuses}
                            onCheckedChange={handleUseBonuses}
                            data-testid="checkbox-use-bonuses"
                          />
                          <label htmlFor="use-bonuses" className="text-sm font-medium cursor-pointer">
                            Использовать бонусы
                          </label>
                        </div>
                        <Badge variant="secondary">Доступно: {bonusPoints} б.</Badge>
                      </div>
                      {useBonuses && cappedBonusesUsed > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Будет использовано: {cappedBonusesUsed} бонусов (макс. 20% от суммы)
                        </p>
                      )}
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between text-lg font-semibold">
                    <span>Итого</span>
                    <span data-testid="text-total">{finalTotal.toFixed(2)} ₽</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
