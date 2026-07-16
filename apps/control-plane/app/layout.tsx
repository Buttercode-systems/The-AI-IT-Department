import "./styles.css";

export const metadata = {
  title: "AID — AI IT Department",
  description: "A conversational AI assistant for your connected business workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
