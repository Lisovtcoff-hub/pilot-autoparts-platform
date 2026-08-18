import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ПИЛОТ — магазин автозапчастей",
  description: "Автозапчасти для иномарок и ВАЗ в Сибае. Заказ на сайте и самовывоз из магазина на проспекте Горняков, 37.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
