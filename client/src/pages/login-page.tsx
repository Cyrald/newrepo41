import { Link, useLocation, useSearch } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, type LoginInput } from "@shared/schema"
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
import { useLogin } from "@/hooks/useAuth"
import { usePrefetchFromReturnUrl } from "@/hooks/usePrefetchRoutes"
import heroImage from "@assets/generated_images/Hero_section_background_image_b0dcdc6c.png"

export default function LoginPage() {
  usePrefetchFromReturnUrl()
  
  const [, setLocation] = useLocation()
  const searchParams = useSearch()
  const { toast } = useToast()
  const loginMutation = useLogin()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (data: LoginInput) => {
    try {
      await loginMutation.mutateAsync(data)
      
      // Redirect to returnUrl or home
      const returnUrl = new URLSearchParams(searchParams).get("returnUrl") || "/"
      setLocation(returnUrl)
    } catch (error: any) {
      toast({
        title: "Ошибка входа",
        description: error.message || "Неверный email или пароль",
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
            <CardTitle className="text-2xl font-serif">Вход</CardTitle>
            <CardDescription>
              Войдите в свой аккаунт для продолжения
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
                      <FormLabel>Email</FormLabel>
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

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пароль</FormLabel>
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

                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" data-testid="checkbox-remember" />
                  <label
                    htmlFor="remember"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Запомнить меня
                  </label>
                </div>

                <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                  {loginMutation.isPending ? "Вход..." : "Войти"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <p className="text-muted-foreground">
                Нет аккаунта?{" "}
                <Link href="/register">
                  <Button variant="ghost" className="p-0" data-testid="link-register">
                    Зарегистрироваться
                  </Button>
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
            ЭкоМаркет
          </h1>
          <p className="text-lg opacity-90 max-w-md">
            Натуральные и органические продукты для здоровой жизни
          </p>
        </div>
      </div>
    </div>
  )
}
