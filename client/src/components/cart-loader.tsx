import { useCart } from "@/hooks/useCart";
import { useAuthStore } from "@/stores/authStore";

function AuthenticatedCartLoader() {
  useCart();
  return null;
}

export function CartLoader() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return null;
  }
  
  return <AuthenticatedCartLoader />;
}
