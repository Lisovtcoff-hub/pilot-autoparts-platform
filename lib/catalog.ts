export type Product = {
  id: number;
  name: string;
  brand: string;
  article: string;
  category: string;
  vehicle: string;
  price: number;
  stock: number;
  icon: string;
  imageKey?: string | null;
  isActive?: boolean;
};


export const orderStatuses = ["new", "confirmed", "ready", "completed", "cancelled"] as const;
export type OrderStatus = typeof orderStatuses[number];

export const statusLabels: Record<OrderStatus, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  ready: "Готов к выдаче",
  completed: "Выдан",
  cancelled: "Отменён",
};
