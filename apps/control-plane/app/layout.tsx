import "./styles.css";

export const metadata = {
  title: "The AI IT Department",
  description: "Connect, verify and configure your business AI workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}