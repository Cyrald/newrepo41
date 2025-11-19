import { Link, useLocation } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { registerSchema, type RegisterInput } from "@shared/schema"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useRegister } from "@/hooks/useAuth"
import { usePrefetchFromReturnUrl } from "@/hooks/usePrefetchRoutes"
import heroImage from "@assets/generated_images/Hero_section_background_image_b0dcdc6c.png"

export default function RegisterPage() {
  usePrefetchFromReturnUrl()
  
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const registerMutation = useRegister()

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      patronymic: "",
      phone: "",
      agreeToTerms: false,
    },
  })

  const onSubmit = async (data: RegisterInput) => {
    try {
      await registerMutation.mutateAsync(data)
      
      setLocation("/login")
    } catch (error: any) {
      toast({
        title: "Ошибка регистрации",
        description: error.message || "Что-то пошло не так",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left - Form */}
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl font-serif">Регистрация</CardTitle>
            <CardDescription>
              Создайте аккаунт и получите 100 бонусов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Пароль *</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Подтвердите пароль *</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="••••••••"
                            {...field}
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Иван"
                          {...field}
                          data-testid="input-first-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Фамилия</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Иванов"
                            {...field}
                            data-testid="input-last-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="patronymic"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Отчество</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Иванович"
                            {...field}
                            data-testid="input-patronymic"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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
                  name="agreeToTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-agree-terms"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Я согласен с условиями использования и политикой конфиденциальности *
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={registerMutation.isPending} data-testid="button-register">
                  {registerMutation.isPending ? "Регистрация..." : "Зарегистрироваться"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <p className="text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login">
                  <span className="text-primary hover:underline cursor-pointer font-medium" data-testid="link-login">
                    Войти
                  </span>
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right - Hero */}
      <div className="hidden lg:block relative">
        <img
          src={heroImage}
          alt="Натуральные продукты"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/20" />
        <div className="relative h-full flex flex-col justify-center px-12 text-white">
          <h1 className="font-serif text-4xl font-bold mb-4">
            Присоединяйтесь к ЭкоМаркет
          </h1>
          <p className="text-lg opacity-90 max-w-md mb-6">
            Получите 100 бонусов при регистрации и используйте их для оплаты заказов
          </p>
          <ul className="space-y-2 opacity-90">
            <li>✓ Бесплатная доставка от 3000 ₽</li>
            <li>✓ Бонусная программа</li>
            <li>✓ Скидки и специальные предложения</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
