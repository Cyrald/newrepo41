import { useState, useEffect } from "react"
import { User, Package, Star, MapPin, LogOut } from "lucide-react"
import { useLocation } from "wouter"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAuthStore } from "@/stores/authStore"
import { useMe, useUpdateProfile, useUpdatePassword } from "@/hooks/useAuth"
import { useOrders } from "@/hooks/useOrders"
import { useAddresses } from "@/hooks/useAddresses"

export default function ProfilePage() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const authInitialized = useAuthStore((state) => state.authInitialized)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)
  
  const { data: user, isLoading: userLoading } = useMe()
  const { data: orders, isLoading: ordersLoading } = useOrders()
  const { data: addresses, isLoading: addressesLoading } = useAddresses()
  
  const updateProfile = useUpdateProfile()
  const updatePassword = useUpdatePassword()

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    patronymic: "",
    phone: "",
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  useEffect(() => {
    if (authInitialized && !isAuthenticated) {
      setLocation("/login?returnUrl=/profile")
    }
  }, [authInitialized, isAuthenticated, setLocation])

  if (!authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    )
  }

  const handleLogout = () => {
    logout()
    setLocation("/")
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile.mutateAsync(profileData)
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить профиль",
        variant: "destructive",
      })
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Ошибка",
        description: "Пароли не совпадают",
        variant: "destructive",
      })
      return
    }

    try {
      await updatePassword.mutateAsync({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      })
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      })
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось изменить пароль",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold" data-testid="text-page-title">
                Профиль
              </h1>
              {user && (
                <p className="mt-1 text-muted-foreground">
                  {user.firstName} {user.lastName}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </Button>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList>
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="mr-2 h-4 w-4" />
                Личные данные
              </TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">
                <Package className="mr-2 h-4 w-4" />
                Заказы
              </TabsTrigger>
              <TabsTrigger value="bonuses" data-testid="tab-bonuses">
                <Star className="mr-2 h-4 w-4" />
                Бонусы
              </TabsTrigger>
              <TabsTrigger value="addresses" data-testid="tab-addresses">
                <MapPin className="mr-2 h-4 w-4" />
                Адреса
              </TabsTrigger>
            </TabsList>

            {/* Personal Info */}
            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle>Личные данные</CardTitle>
                  <CardDescription>
                    Обновите свою личную информацию
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">Имя</Label>
                        <Input
                          id="firstName"
                          defaultValue={user?.firstName || ""}
                          onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                          data-testid="input-first-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="lastName">Фамилия</Label>
                        <Input
                          id="lastName"
                          defaultValue={user?.lastName || ""}
                          onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="patronymic">Отчество</Label>
                      <Input
                        id="patronymic"
                        defaultValue={user?.patronymic || ""}
                        onChange={(e) => setProfileData({...profileData, patronymic: e.target.value})}
                        data-testid="input-patronymic"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Телефон</Label>
                      <Input
                        id="phone"
                        type="tel"
                        defaultValue={user?.phone || ""}
                        onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                        data-testid="input-phone"
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={updateProfile.isPending} data-testid="button-save-profile">
                        {updateProfile.isPending ? "Сохранение..." : "Сохранить изменения"}
                      </Button>
                    </div>
                  </form>

                  <Separator className="my-6" />

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <h3 className="text-lg font-semibold">Изменить пароль</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Текущий пароль</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        data-testid="input-current-password"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">Новый пароль</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                          data-testid="input-new-password"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                          data-testid="input-confirm-password"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={updatePassword.isPending} data-testid="button-change-password">
                        {updatePassword.isPending ? "Изменение..." : "Изменить пароль"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Orders */}
            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>История заказов</CardTitle>
                  <CardDescription>
                    Просмотр всех ваших заказов
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="text-center py-8">Загрузка...</div>
                  ) : !orders || orders.length === 0 ? (
                    <div className="py-12 text-center">
                      <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-semibold mb-2">У вас пока нет заказов</p>
                      <p className="text-muted-foreground mb-6">
                        Начните с выбора товаров в каталоге
                      </p>
                      <Button onClick={() => setLocation("/catalog")} data-testid="button-go-to-catalog">
                        Перейти в каталог
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((order) => (
                        <Card key={order.id}>
                          <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <p className="font-semibold">Заказ №{order.orderNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(order.createdAt).toLocaleDateString("ru-RU")}
                                </p>
                              </div>
                              <Badge variant={
                                order.status === "delivered" ? "default" :
                                order.status === "cancelled" ? "destructive" :
                                "secondary"
                              }>
                                {order.status}
                              </Badge>
                            </div>
                            <Separator className="my-4" />
                            <div className="flex justify-between items-center">
                              <p className="text-lg font-semibold">
                                {order.totalAmount.toFixed(0)} ₽
                              </p>
                              <Button variant="outline" size="sm">
                                Подробнее
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Bonuses */}
            <TabsContent value="bonuses">
              <Card>
                <CardHeader>
                  <CardTitle>Бонусная программа</CardTitle>
                  <CardDescription>
                    Накапливайте бонусы и получайте скидки
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="rounded-lg bg-primary/10 p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        Доступные бонусы
                      </p>
                      <p className="text-4xl font-bold text-primary" data-testid="text-bonus-points">
                        {user?.bonusBalance || 0}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        1 бонус = 1 рубль
                      </p>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Как получить бонусы?</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li>• 100 бонусов при регистрации</li>
                        <li>• 5% от суммы каждого заказа</li>
                        <li>• За написание отзыва - 50 бонусов</li>
                        <li>• За приглашение друга - 200 бонусов</li>
                      </ul>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h3 className="font-semibold">Как использовать?</h3>
                      <p className="text-sm text-muted-foreground">
                        При оформлении заказа вы можете использовать до 30% от суммы заказа бонусами
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Addresses */}
            <TabsContent value="addresses">
              <Card>
                <CardHeader>
                  <CardTitle>Адреса доставки</CardTitle>
                  <CardDescription>
                    Управление адресами для быстрого оформления заказов
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {addressesLoading ? (
                    <div className="text-center py-8">Загрузка...</div>
                  ) : !addresses || addresses.length === 0 ? (
                    <div className="py-12 text-center">
                      <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-semibold mb-2">Нет сохраненных адресов</p>
                      <p className="text-muted-foreground mb-6">
                        Добавьте адрес для быстрого оформления заказов
                      </p>
                      <Button data-testid="button-add-address">
                        Добавить адрес
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Button className="w-full" data-testid="button-add-address">
                        Добавить новый адрес
                      </Button>
                      {addresses.map((address) => (
                        <Card key={address.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                {address.isDefault && (
                                  <Badge className="mb-2" variant="default">Основной</Badge>
                                )}
                                <p className="font-semibold">{address.label}</p>
                                <p className="text-sm text-muted-foreground">
                                  {address.city}, {address.street}, д. {address.building}
                                  {address.apartment && `, кв. ${address.apartment}`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {address.postalCode}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm">
                                  Изменить
                                </Button>
                                <Button variant="ghost" size="sm">
                                  Удалить
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  )
}
