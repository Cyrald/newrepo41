import { useState } from "react"
import { Link } from "wouter"
import { ShoppingCart, Heart, Eye } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Product } from "@shared/schema"
import { useCartStore } from "@/stores/cartStore"
import { useUpdateCartItem } from "@/hooks/useCart"

interface ProductCardProps {
  product: Product & { images?: { url: string }[] }
  onAddToCart?: (productId: string) => void
  onToggleWishlist?: (productId: string) => void
  isInWishlist?: boolean
}

export function ProductCard({ product, onAddToCart, onToggleWishlist, isInWishlist = false }: ProductCardProps) {
  const [isWishlistLoading, setIsWishlistLoading] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [localQuantity, setLocalQuantity] = useState<string>("")
  
  // Get cart quantity for this product
  const cartItems = useCartStore((state) => state.items)
  const cartQuantity = cartItems.find(item => item.productId === product.id)?.quantity || 0
  const updateCartItem = useUpdateCartItem()
  const hasDiscount = parseFloat(product.discountPercentage) > 0
  const discountedPrice = hasDiscount
    ? parseFloat(product.price) * (1 - parseFloat(product.discountPercentage) / 100)
    : parseFloat(product.price)
  
  const firstImage = product.images?.[0]?.url

  const handleWishlistClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isWishlistLoading || !onToggleWishlist) return
    
    // Quick "tap" animation like Instagram
    setIsAnimating(true)
    setIsWishlistLoading(true)
    
    // Animation lasts 200ms regardless of API response
    setTimeout(() => setIsAnimating(false), 200)
    
    try {
      await onToggleWishlist(product.id)
    } finally {
      setIsWishlistLoading(false)
    }
  }

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalQuantity(value)
  }

  const handleQuantityBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value
    const newQuantity = parseInt(value, 10)
    if (!isNaN(newQuantity) && newQuantity > 0 && newQuantity <= product.stockQuantity) {
      setLocalQuantity(String(newQuantity))
      updateCartItem.mutate({ productId: product.id, quantity: newQuantity })
    } else {
      setLocalQuantity(String(cartQuantity))
    }
  }

  return (
    <Card className="group relative overflow-hidden transition-all duration-200 flex flex-col">
      <Link href={`/products/${product.id}`}>
        <div className="relative aspect-[3/4] overflow-hidden bg-muted">
          {firstImage ? (
            <img
              src={firstImage}
              alt={product.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Eye className="h-8 w-8" />
            </div>
          )}
          
          {/* Badges */}
          <div className="absolute left-1.5 top-1.5 flex flex-col gap-0.5">
            {product.isNew && (
              <Badge variant="default" className="text-xs px-1.5 py-0" data-testid={`badge-new-${product.id}`}>
                Новый
              </Badge>
            )}
            {hasDiscount && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0" data-testid={`badge-discount-${product.id}`}>
                -{product.discountPercentage}%
              </Badge>
            )}
          </div>

          {/* Quick actions on hover */}
          <div className="absolute right-1.5 top-1.5 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {onToggleWishlist && (
              <Button
                size="icon"
                variant="secondary"
                onClick={handleWishlistClick}
                disabled={isWishlistLoading}
                data-testid={`button-wishlist-${product.id}`}
                className="h-7 w-7"
              >
                <Heart 
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    isInWishlist 
                      ? "fill-red-500 text-red-500" 
                      : ""
                  } ${isAnimating ? "scale-125" : "scale-100"}`} 
                />
              </Button>
            )}
          </div>
        </div>
      </Link>

      <CardContent className="p-2.5 flex flex-col flex-grow">
        <Link href={`/products/${product.id}`}>
          <h3 className="mb-0.5 line-clamp-2 text-sm font-semibold min-h-[2.5rem]" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
        </Link>
        
        {product.weight && (
          <p className="mb-1 text-xs text-muted-foreground" data-testid={`text-weight-${product.id}`}>
            {product.weight} г
          </p>
        )}
        {product.volume && (
          <p className="mb-1 text-xs text-muted-foreground" data-testid={`text-volume-${product.id}`}>
            {product.volume} мл
          </p>
        )}

        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-base font-bold text-foreground" data-testid={`text-price-${product.id}`}>
            {discountedPrice.toFixed(0)} ₽
          </span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through" data-testid={`text-old-price-${product.id}`}>
              {parseFloat(product.price).toFixed(0)} ₽
            </span>
          )}
        </div>

        <div className="mt-auto">
          {product.stockQuantity > 0 ? (
            cartQuantity > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Button
                  className="w-full h-8 text-xs bg-secondary/80 hover:bg-secondary text-secondary-foreground"
                  size="sm"
                  variant="secondary"
                  disabled
                  data-testid={`button-in-cart-${product.id}`}
                >
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                  В корзине
                </Button>
                <Input
                  type="text"
                  min="1"
                  max={product.stockQuantity}
                  value={localQuantity || cartQuantity}
                  onChange={handleQuantityChange}
                  onBlur={handleQuantityBlur}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-8 text-xs text-center"
                  data-testid={`input-quantity-${product.id}`}
                />
              </div>
            ) : (
              <Button
                className="w-full h-8 text-xs"
                size="sm"
                onClick={() => onAddToCart?.(product.id)}
                data-testid={`button-add-to-cart-${product.id}`}
              >
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                В корзину
              </Button>
            )
          ) : (
            <Button
              className="w-full h-8 text-xs"
              size="sm"
              variant="secondary"
              disabled
              data-testid={`button-out-of-stock-${product.id}`}
            >
              Нет в наличии
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
