import { createContext, useContext, useState, ReactNode } from 'react';

export interface ProductItem {
  id: number;
  slug: string;
  nameEn: string;
  nameTh: string;
  descriptionEn: string;
  descriptionTh: string;
  category: string;
  rarity: string;
  priceSatang: number;
  stock: number;
  imageUrl: string;
  isActive: boolean;
  hasAutoAccountDelivery?: boolean;
  deliveryAccountUsername?: string | null;
  deliveryAccountPassword?: string | null;
}

export interface CartEntry {
  product: ProductItem;
  quantity: number;
}

interface CartContextValue {
  items: CartEntry[];
  totalCount: number;
  totalSatang: number;
  addItem: (product: ProductItem, qty?: number) => void;
  updateQty: (productId: number, qty: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartEntry[]>([]);

  const addItem = (product: ProductItem, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((e) => e.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + qty);
        return prev.map((e) =>
          e.product.id === product.id ? { ...e, product, quantity: nextQty } : e
        );
      }
      return [...prev, { product, quantity: Math.min(product.stock, qty) }];
    });
  };

  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((e) => e.product.id !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((e) =>
        e.product.id === productId
          ? { ...e, quantity: Math.min(e.product.stock, qty) }
          : e
      )
    );
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((e) => e.product.id !== productId));
  };

  const clearCart = () => setItems([]);

  const totalCount = items.reduce((sum, e) => sum + e.quantity, 0);
  const totalSatang = items.reduce((sum, e) => sum + e.product.priceSatang * e.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, totalCount, totalSatang, addItem, updateQty, removeItem, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
}
