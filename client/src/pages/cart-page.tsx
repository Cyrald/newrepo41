import { Link } from "wouter"
import { Trash2, ShoppingBag, Plus, Minus } from "lucide-react"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/empty-state"
import { useCart, useUpdateCartItem, useRemoveFromCart } from "@/hooks/useCart"
import { useToast } from "@/hooks/use-toast"

export default function CartPage() {
  const { toast } = useToast()
  const { data: cartItems = [], isLoading } = useCart()
  const updateCartMutation = useUpdateCartItem()
  const removeCartMutation = useRemoveFromCart()

  const subtotal = cartItems.reduce((sum, item: any) => {
    return sum + (parseFloat(item.product?.price || "0") * item.quantity)
  }, 0)
  const deliveryCost = subtotal > 0 ? 300 : 0
  const total = subtotal + deliveryCost

  const handleUpdateQuantity = async (productId: string, newQuantity: number) => {
    try {
      await updateCartMutation.mutateAsync({ productId, quantity: newQuantity })
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить количество",
        variant: "destructive",
      })
    }
  }

  const handleRemoveItem = async (productId: string) => {
    try {
      await removeCartMutation.mutateAsync(productId)
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить товар",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 font-serif text-3xl md:text-4xl font-semibold" data-testid="text-page-title">
            Корзина
          </h1>

          {cartItems.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Корзина пуста"
              description="Добавьте товары из каталога для оформления заказа"
              action={{
                label: "Перейти в каталог",
                onClick: () => window.location.href = "/catalog",
              }}
            />
          ) : (
            <div className="grid gap-8 lg:grid-cols-3">
              {/* Cart Items */}
              <div className="lg:col-span-2 space-y-4">
                {cartItems.map((item: any) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        {/* Product Image */}
                        <div className="w-20 shrink-0 overflow-hidden rounded-md bg-muted aspect-[3/4]">
                          {item.product.images?.[0]?.url && (
                            <img
                              src={item.product.images[0].url}
                              alt={item.product.name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1">
                          <Link href={`/products/${item.product.id}`}>
                            <h3 className="font-semibold hover:underline" data-testid={`text-product-name-${item.id}`}>
                              {item.product.name}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground">
                            {item.product.weight && `${item.product.weight} г`}
                            {item.product.volume && `${item.product.volume} мл`}
                          </p>
                          <p className="mt-2 font-semibold" data-testid={`text-price-${item.id}`}>
                            {parseFloat(item.product.price)} ₽
                          </p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.product.id)}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value))}
                              className="h-8 w-16 text-center"
                              min="1"
                              data-testid={`input-quantity-${item.id}`}
                            />
                            
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Order Summary */}
              <div>
                <Card className="sticky top-24">
                  <CardContent className="p-6 space-y-4">
                    <h2 className="font-serif text-xl font-semibold">Итого</h2>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Товары ({cartItems.length})</span>
                        <span data-testid="text-subtotal">{subtotal.toFixed(2)} ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Доставка</span>
                        <span data-testid="text-delivery">
                          {deliveryCost === 0 ? "Бесплатно" : `${deliveryCost.toFixed(2)} ₽`}
                        </span>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-between text-lg font-semibold">
                      <span>Итого</span>
                      <span data-testid="text-total">{total.toFixed(2)} ₽</span>
                    </div>

                    <Button className="w-full" size="lg" asChild data-testid="button-checkout">
                      <Link href="/checkout">
                        Оформить заказ
                      </Link>
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Бесплатная доставка от 3000 ₽
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
