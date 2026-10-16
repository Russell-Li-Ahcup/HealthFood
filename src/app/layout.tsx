import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "HealthFood 营养搭配",
  description: "根据身体指标推算营养目标，随机生成到下次采购前的菜品，再按这些菜决定买多少",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10b981",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-mode="maintain">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
