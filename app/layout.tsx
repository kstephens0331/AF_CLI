export const metadata = { title: "AF CLI UI" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: 16 }}>{children}</body>
    </html>
  );
}
